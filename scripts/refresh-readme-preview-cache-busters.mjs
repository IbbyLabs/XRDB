import { syncReadmePreviewGallery } from './sync-readme-preview-gallery.mjs';

const result = await syncReadmePreviewGallery();

console.log(
  `Synced README preview gallery and cache buster tokens for version ${result.version}.`,
);
