import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#24180f",
        oxblood: "#67140f",
        vellum: "#f3e5c4",
        goldleaf: "#b6822a"
      },
      fontFamily: {
        serif: ["Forge Cormorant", "Forge EB Garamond", "Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
