// Redimensiona (máx. 1280 px) y recomprime a JPEG antes de enviar, igual que la
// PWA de personeros: una foto de celular sin comprimir puede pesar varios MB.
export async function comprimirImagen(archivo: File): Promise<string> {
  const original: string = await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result as string);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
  const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = original;
  });
  const escala = Math.min(1, 1280 / Math.max(imagen.width, imagen.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagen.width * escala);
  canvas.height = Math.round(imagen.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.6);
}
