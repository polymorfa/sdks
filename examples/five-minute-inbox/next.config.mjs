/** @type {import("next").NextConfig} */
const nextConfig = {
  webpack(config) {
    // Sources use NodeNext-style `.js` specifiers for their `.ts(x)` files.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
