# Diaryx App

- [Diaryx Main Site](https://www.diaryx.net)
- [Diaryx App](https://app.diaryx.net)
- [Diaryx Spec](https://spec.diaryx.net)

---

## Overview

This is the Diaryx App— a place to record your thoughts in a future-proof format.

## Project Structure

This project is using Qwik with [QwikCity](https://qwik.dev/qwikcity/overview/).

```
├── public/
│   └── ...
└── src/
    ├── components/
    │   └── ...
    └── routes/
        └── ...
```

- `src/routes`: Provides the directory-based routing, which can include a hierarchy of `layout.tsx` layout files, and an `index.tsx` file as the page. Additionally, `index.ts` files are endpoints. Please see the [routing docs](https://qwik.dev/qwikcity/routing/overview/) for more info.

- `src/components`: Directory for components.

- `public`: Any static assets, like images, can be placed in the public directory.

## Development

Development mode uses [Vite's development server](https://vitejs.dev/). The `dev` command will server-side render (SSR) the output during development.

```shell
npm start # or `bun start`
```

## Preview

The preview command will create a production build of the client modules, a production build of `src/entry.preview.tsx`, and run a local server. The preview server is only for convenience to preview a production build locally and should not be used as a production server.

```shell
bun preview # or `bun preview`
```

## Production

The production build will generate client and server modules by running both client and server build commands. The build command will use Typescript to run a type check on the source code.

```shell
bun build # or `bun build`
```

## Static Site Generator (Node.js)

Be sure to configure your server to serve very long cache headers for the `build/**/*.js` files.

Typically you'd set the `Cache-Control` header for those files to `public, max-age=31536000, immutable`.

```shell
npm run build.server
```
