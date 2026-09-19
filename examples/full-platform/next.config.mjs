/** @type {import("next").NextConfig} */
const nextConfig = {
  // The Polymorfa development assistant already sits in the bottom-left
  // corner; hide the Next.js badge so neither covers the app.
  devIndicators: false,
  webpack(config) {
    // Sources use NodeNext-style `.js` specifiers for their `.ts(x)` files.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
