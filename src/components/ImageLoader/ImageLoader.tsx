import React, { useRef, useState } from 'react';
import './ImageLoader.css';

interface ImageLoaderProps {
  onImageLoad: (src: string) => void;
  onImageSelectStart?: () => void;
  onImageSelectCancel?: () => void;
}

const ImageLoader: React.FC<ImageLoaderProps> = ({
  onImageLoad,
  onImageSelectStart,
  onImageSelectCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const timeoutRef = useRef<number | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      onImageSelectCancel?.();
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Por favor, selecciona un formato válido (JPEG, JPG, PNG, WEBP).');
      onImageSelectCancel?.();
      inputRef.current!.value = '';
      return;
    }

    onImageSelectStart?.();

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      // Configuramos un timeout claro
      timeoutRef.current = window.setTimeout(() => {
        img.src = ''; // Abortar la carga
        alert('La carga de la imagen ha tardado demasiado.');
        onImageSelectCancel?.();
      }, 10000);

      img.onload = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setPreviewSrc(reader.result as string);
        onImageLoad(reader.result as string);
      };

      img.onerror = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        alert('Error al cargar imagen.');
        onImageSelectCancel?.();
      };

      img.src = reader.result as string;
    };

    reader.onerror = () => {
      alert('Error al leer el archivo.');
      onImageSelectCancel?.();
    };

    reader.readAsDataURL(file);
  };

  const openFileSelector = () => {
    inputRef.current?.click();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
      }}
    >
      <div className="image-loader-container">
        <button className="load-image-button" onClick={openFileSelector}>
          Cargar Imagen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />
        {previewSrc && (
          <img className="loaded-image" src={previewSrc} alt="Preview" />
        )}
      </div>
    </div>
  );
};

export default ImageLoader;