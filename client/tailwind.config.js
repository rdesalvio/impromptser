/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        paper: "#fafaf7",
        accent: "#7c3aed",
        danger: "#dc2626",
      },
      fontFamily: {
        display: ["system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
