import ImageKit from 'imagekit';
import { config } from './config.js';

let imagekit = null;

if (config.imagekit.publicKey && config.imagekit.privateKey && config.imagekit.urlEndpoint) {
  imagekit = new ImageKit({
    publicKey: config.imagekit.publicKey,
    privateKey: config.imagekit.privateKey,
    urlEndpoint: config.imagekit.urlEndpoint,
  });
} else {
  console.warn("WARNING: ImageKit configuration is incomplete. Image uploads will fail at runtime.");
}

export default imagekit;
