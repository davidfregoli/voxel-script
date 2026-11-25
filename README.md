# Diorama gallery

This branch is the built gallery served at https://davidfregoli.github.io/voxel-script/.

It holds twelve voxel dioramas authored with the tools on the `main` branch, as exported `.vox` files, together with a
small WebGL2 viewer that loads them in the browser. Everything here is generated output; edit nothing on this branch
by hand.

- `vox/`: the exported models. Each embeds its own palette.
- `views/`: a thumbnail and a four-angle CPU preview per model, rendered from those files.
- `manifest.json`: titles, default lighting and camera for each scene.
- `index.html` and the `.js` files: the viewer. It has no dependencies and no build step.
