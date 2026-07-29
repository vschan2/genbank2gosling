/** @type {import('next').NextConfig} */
const nextConfig = {
  // HiGlass's PIXI-renderer teardown can't handle React 18 Strict Mode's
  // dev-only double mount/unmount — it calls destroy() on a not-yet-initialized
  // renderer, throwing "Cannot read properties of null (reading 'destroy')".
  reactStrictMode: false,
};

export default nextConfig;
