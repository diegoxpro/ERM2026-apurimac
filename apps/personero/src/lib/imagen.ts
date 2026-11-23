// Redimensiona y recomprime la foto en el propio dispositivo antes de enviarla:
// una foto de cámara sin comprimir puede pesar varios MB, inviable con señal
// rural intermitente. Con esto queda típicamente en unos cientos de KB.
export async function comprimirImagen(archivo: File): Promise<string> {
  const dataUrlOriginal: string = await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result as string);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });

  const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrlOriginal;
  });

  // 1600 px y calidad 0.7: suficiente para que la IA lea los números escritos a mano.
  const MAX_LADO = 1600;
  const escala = Math.min(1, MAX_LADO / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrlOriginal;
  ctx.drawImage(imagen, 0, 0, ancho, alto);

  return canvas.toDataURL('image/jpeg', 0.7);
}
