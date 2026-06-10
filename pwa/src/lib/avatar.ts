// Redimensiona y recorta una imagen a un avatar cuadrado, devolviendo un data: URL.
// Se usa data: URL (no blob:) porque el CSP solo permite data: en img-src.
export function resizeImageToAvatar(file: File, size = 128, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      if (!src) return reject(new Error('No se pudo leer la imagen'));
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas no disponible'));
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.src = src;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
