/**
 * Saves text as a file through the browser's normal download flow. A link with the
 * `download` attribute needs no `downloads` permission.
 */
export function downloadTextFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // The download reads the blob after click() returns, so release it later.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
