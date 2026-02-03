/**
 * Utility to compress and convert images to JPG < 200KB
 */
export async function compressImage(file: File, maxWidth = 1000, maxQuality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize if too large
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context not found'));

        // Fill white background for JPG (transparency would become black)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Recursive compression to hit target size
        const attemptCompression = (quality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Compression failed'));
              
              // If still > 200KB and quality > 0.1, try lower quality
              if (blob.size > 200 * 1024 && quality > 0.1) {
                attemptCompression(quality - 0.1);
              } else {
                resolve(blob);
              }
            },
            'image/jpeg',
            quality
          );
        };

        attemptCompression(maxQuality);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}
