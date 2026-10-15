"""Real keyboard and mouse input, and screenshots, on an X display.

The end-to-end tests run browsers on their own virtual display (Xvfb) and use this
script to press keys and click as the operating system does, through the X server's
XTEST extension. Browsers handle these like a person's input, unlike events sent
through their automation protocols. Uses only the Python standard library and the
system's libX11 and libXtst.

Usage, with DISPLAY (and XAUTHORITY) set:
  x11-input.py keys Alt+Shift+S [Up Return ...]  press each key combination in turn
  x11-input.py click X Y [left|right]            move the pointer to X,Y and click
  x11-input.py move X Y                          move the pointer
  x11-input.py screenshot FILE.png               save the whole screen
  x11-input.py find IMAGE.png X0 Y0 X1 Y1         print where IMAGE's opaque pixels appear on
                                                 screen within that box, as JSON [[x, y], ...]
                                                 (centres); used to find menu items by icon
  x11-input.py windows                           print the visible top-level windows (native
                                                 menus are among them) as JSON
  x11-input.py ping                              exit 0 once the display accepts clients
"""

import ctypes
import json
import struct
import sys
import time
import zlib

x11 = ctypes.CDLL("libX11.so.6")
xtst = ctypes.CDLL("libXtst.so.6")

x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDisplayWidth.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDisplayHeight.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XGetImage.restype = ctypes.c_void_p
x11.XGetImage.argtypes = [
    ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int,
    ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int,
]
x11.XFree.argtypes = [ctypes.c_void_p]
x11.XQueryTree.argtypes = [
    ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
    ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint),
]
x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeMotionEvent.argtypes = [
    ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong,
]

# Key names as the tests write them, mapped to X keysym names.
KEYSYMS = {
    "Alt": "Alt_L",
    "Shift": "Shift_L",
    "Ctrl": "Control_L",
    "Enter": "Return",
    "Escape": "Escape",
    "ArrowUp": "Up",
    "ArrowDown": "Down",
}
BUTTONS = {"left": 1, "right": 3}
# Gives the browser time to handle each event before the next, as a person's typing does.
PAUSE = 0.05


class XImage(ctypes.Structure):
    _fields_ = [
        ("width", ctypes.c_int), ("height", ctypes.c_int), ("xoffset", ctypes.c_int),
        ("format", ctypes.c_int), ("data", ctypes.POINTER(ctypes.c_ubyte)),
        ("byte_order", ctypes.c_int), ("bitmap_unit", ctypes.c_int),
        ("bitmap_bit_order", ctypes.c_int), ("bitmap_pad", ctypes.c_int),
        ("depth", ctypes.c_int), ("bytes_per_line", ctypes.c_int),
        ("bits_per_pixel", ctypes.c_int),
    ]


class XWindowAttributes(ctypes.Structure):
    _fields_ = [
        ("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int),
        ("height", ctypes.c_int), ("border_width", ctypes.c_int), ("depth", ctypes.c_int),
        ("visual", ctypes.c_void_p), ("root", ctypes.c_ulong), ("window_class", ctypes.c_int),
        ("bit_gravity", ctypes.c_int), ("win_gravity", ctypes.c_int),
        ("backing_store", ctypes.c_int), ("backing_planes", ctypes.c_ulong),
        ("backing_pixel", ctypes.c_ulong), ("save_under", ctypes.c_int),
        ("colormap", ctypes.c_ulong), ("map_installed", ctypes.c_int),
        ("map_state", ctypes.c_int), ("all_event_masks", ctypes.c_long),
        ("your_event_mask", ctypes.c_long), ("do_not_propagate_mask", ctypes.c_long),
        ("override_redirect", ctypes.c_int), ("screen", ctypes.c_void_p),
    ]


def open_display():
    display = x11.XOpenDisplay(None)
    if not display:
        raise SystemExit("Cannot open the X display")
    return display


def keycode(display, name):
    keysym = x11.XStringToKeysym(KEYSYMS.get(name, name.lower() if len(name) == 1 else name).encode())
    code = x11.XKeysymToKeycode(display, keysym) if keysym else 0
    if not code:
        raise SystemExit(f"Unknown key {name}")
    return code


def press_keys(display, combination):
    codes = [keycode(display, name) for name in combination.split("+")]
    for code in codes:
        xtst.XTestFakeKeyEvent(display, code, True, 0)
        x11.XSync(display, False)
        time.sleep(PAUSE)
    for code in reversed(codes):
        xtst.XTestFakeKeyEvent(display, code, False, 0)
        x11.XSync(display, False)
        time.sleep(PAUSE)


def move(display, x, y):
    xtst.XTestFakeMotionEvent(display, -1, x, y, 0)
    x11.XSync(display, False)
    time.sleep(PAUSE)


def click(display, x, y, button):
    focus_window_at(display, x, y)
    move(display, x, y)
    for down in (True, False):
        xtst.XTestFakeButtonEvent(display, BUTTONS[button], down, 0)
        x11.XSync(display, False)
        time.sleep(PAUSE)


def capture(display):
    """The whole screen as (width, height, RGB bytes)."""
    screen = x11.XDefaultScreen(display)
    width = x11.XDisplayWidth(display, screen)
    height = x11.XDisplayHeight(display, screen)
    all_planes = 0xFFFFFFFF
    z_pixmap = 2
    pointer = x11.XGetImage(
        display, x11.XDefaultRootWindow(display), 0, 0, width, height, all_planes, z_pixmap
    )
    image = XImage.from_address(pointer)
    if image.bits_per_pixel != 32:
        raise SystemExit(f"Expected a 32-bit screen, got {image.bits_per_pixel} bits per pixel")
    raw = ctypes.string_at(image.data, image.bytes_per_line * height)
    x11.XFree(image.data)
    x11.XFree(pointer)
    # Xvfb stores each pixel as blue, green, red, unused.
    rgb = bytearray(width * height * 3)
    for y in range(height):
        row = raw[y * image.bytes_per_line : y * image.bytes_per_line + width * 4]
        start = y * width * 3
        rgb[start : start + width * 3 : 3] = row[2::4]
        rgb[start + 1 : start + width * 3 : 3] = row[1::4]
        rgb[start + 2 : start + width * 3 : 3] = row[0::4]
    return width, height, bytes(rgb)


def screenshot(display, path):
    width, height, rgb = capture(display)
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # PNG filter: none.
        rows += rgb[y * width * 3 : (y + 1) * width * 3]

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    with open(path, "wb") as file:
        file.write(b"\x89PNG\r\n\x1a\n")
        file.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
        file.write(chunk(b"IDAT", zlib.compress(bytes(rows), 6)))
        file.write(chunk(b"IEND", b""))


def read_rgba_png(path):
    """Decodes an 8-bit RGBA, non-interlaced PNG (such as Clipwise's icons)."""
    data = open(path, "rb").read()
    position, chunks = 8, {}
    while position < len(data):
        (length,) = struct.unpack(">I", data[position : position + 4])
        kind = data[position + 4 : position + 8]
        chunks[kind] = chunks.get(kind, b"") + data[position + 8 : position + 8 + length]
        position += 12 + length
    width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", chunks[b"IHDR"])
    if (depth, color, interlace) != (8, 6, 0):
        raise SystemExit(f"{path} is not an 8-bit RGBA, non-interlaced PNG")
    raw, stride, pixels = zlib.decompress(chunks[b"IDAT"]), width * 4, bytearray()
    previous = bytearray(stride)
    for y in range(height):
        kind, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)])
        for i in range(stride):
            left = line[i - 4] if i >= 4 else 0
            up = previous[i]
            corner = previous[i - 4] if i >= 4 else 0
            if kind == 1:
                line[i] = (line[i] + left) & 0xFF
            elif kind == 2:
                line[i] = (line[i] + up) & 0xFF
            elif kind == 3:
                line[i] = (line[i] + (left + up) // 2) & 0xFF
            elif kind == 4:
                estimate = left + up - corner
                nearest = min(
                    (abs(estimate - left), 0, left),
                    (abs(estimate - up), 1, up),
                    (abs(estimate - corner), 2, corner),
                )[2]
                line[i] = (line[i] + nearest) & 0xFF
        pixels += line
        previous = line
    return width, height, pixels


def find(display, path, box):
    """Centres of the places where every opaque pixel of the image matches the screen."""
    width, height, image = read_rgba_png(path)
    opaque = [
        (x, y, image[(y * width + x) * 4 : (y * width + x) * 4 + 3])
        for y in range(height)
        for x in range(width)
        if image[(y * width + x) * 4 + 3] == 255
    ]
    screen_width, screen_height, screen = capture(display)
    x0, y0 = max(box[0], 0), max(box[1], 0)
    x1, y1 = min(box[2], screen_width - width), min(box[3], screen_height - height)
    tolerance = 40

    def matches(left, top):
        for x, y, color in opaque:
            at = ((top + y) * screen_width + left + x) * 3
            if any(abs(screen[at + c] - color[c]) > tolerance for c in range(3)):
                return False
        return True

    found = []
    for top in range(y0, y1 + 1):
        for left in range(x0, x1 + 1):
            if matches(left, top) and all(
                abs(left + width // 2 - x) > 4 or abs(top + height // 2 - y) > 4 for x, y in found
            ):
                found.append((left + width // 2, top + height // 2))
    print(json.dumps(found))


def focus_window_at(display, x, y):
    """Gives the keyboard to the window at (x, y), as a window manager does on a click.

    With no window manager, X sends keys to whichever window is under the pointer.
    Moving onto a menu would then take the keyboard from the browser window, and
    browsers close their menus when their window loses it. Menus (override-redirect
    windows) never get the keyboard from a window manager, so they keep it here too.
    """
    for window in reversed(top_level_windows(display)):
        inside = (window["x"] <= x < window["x"] + window["width"]
                  and window["y"] <= y < window["y"] + window["height"])
        if inside:
            if not window["overrideRedirect"]:
                revert_to_parent, current_time = 2, 0
                x11.XSetInputFocus(display, window["id"], revert_to_parent, current_time)
                x11.XSync(display, False)
            return


def windows(display):
    print(json.dumps(top_level_windows(display)))


def top_level_windows(display):
    """Visible children of the root window, bottom to top. Menus and popups are
    override-redirect windows: they appear without a window manager's help."""
    root, parent = ctypes.c_ulong(), ctypes.c_ulong()
    children, count = ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
    x11.XQueryTree(
        display, x11.XDefaultRootWindow(display), ctypes.byref(root), ctypes.byref(parent),
        ctypes.byref(children), ctypes.byref(count),
    )
    found = []
    for index in range(count.value):
        attributes = XWindowAttributes()
        x11.XGetWindowAttributes(display, children[index], ctypes.byref(attributes))
        is_viewable = 2
        if attributes.map_state == is_viewable:
            found.append({
                "id": children[index], "x": attributes.x, "y": attributes.y,
                "width": attributes.width, "height": attributes.height,
                "overrideRedirect": bool(attributes.override_redirect),
            })
    if children:
        x11.XFree(children)
    return found


def main(args):
    command = args[0] if args else ""
    if command == "ping":
        x11.XCloseDisplay(open_display())
        return
    display = open_display()
    try:
        if command == "keys":
            for combination in args[1:]:
                press_keys(display, combination)
        elif command == "click":
            click(display, int(args[1]), int(args[2]), args[3] if len(args) > 3 else "left")
        elif command == "move":
            move(display, int(args[1]), int(args[2]))
        elif command == "screenshot":
            screenshot(display, args[1])
        elif command == "windows":
            windows(display)
        elif command == "find":
            find(display, args[1], [int(value) for value in args[2:6]])
        else:
            raise SystemExit(__doc__)
    finally:
        x11.XCloseDisplay(display)


main(sys.argv[1:])
