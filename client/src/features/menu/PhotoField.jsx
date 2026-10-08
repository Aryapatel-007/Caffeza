/**
 * The dish photo in the item editor. P24. Choose, preview, replace, remove.
 * Saved on its own, straight away: a photo is not part of the item's form.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { menuPhotoUrl, removeMenuPhoto, setMenuPhoto } from '../../api/menu.js';
import Button from '../../components/ui/Button.jsx';
import DishPhoto from '../../components/ui/DishPhoto.jsx';
import { preparePhoto } from './photoFile.js';

export default function PhotoField({ item }) {
  const queryClient = useQueryClient();
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const hash = item.photo?.sha256 ?? null;

  const stored = useQuery({
    queryKey: ['menu-photo', item.id, hash],
    queryFn: () => menuPhotoUrl(item.id),
    enabled: Boolean(hash) && !preview,
    staleTime: Infinity,
  });
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
  };
  const upload = useMutation({
    mutationFn: (image) => setMenuPhoto(item.id, image),
    onSuccess: () => {
      setMessage('Photo saved.');
      refresh();
    },
    onError: (error) => {
      setPreview(null);
      setMessage(error.message);
    },
  });
  const remove = useMutation({
    mutationFn: () => removeMenuPhoto(item.id),
    onSuccess: () => {
      setPreview(null);
      setMessage('Photo removed.');
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      setMessage(prepared.message);
      return;
    }
    setPreview(prepared.previewUrl);
    upload.mutate(prepared.image);
  };

  const src = preview ?? stored.data ?? null;
  const hasPhoto = Boolean(preview || hash);

  return (
    <div className="flex flex-col gap-2">
      <span className="type-label">Photo</span>
      <div className="flex items-center gap-3">
        <DishPhoto src={src} name={item.name} className="size-24 flex-none rounded-lg" />
        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={choose} />
          <Button type="button" variant="secondary" size="sm" isLoading={upload.isPending} onClick={() => input.current?.click()}>
            {hasPhoto ? 'Replace photo' : 'Add photo'}
          </Button>
          {hasPhoto && (
            <Button type="button" variant="quiet" size="sm" isLoading={remove.isPending} onClick={() => remove.mutate()}>
              Remove photo
            </Button>
          )}
        </div>
      </div>
      <span className="type-caption text-muted">{message ?? 'Shown on your ordering page. Resized on this device before it is sent.'}</span>
    </div>
  );
}
