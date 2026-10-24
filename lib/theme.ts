export type Theme = "dark" | "light";
export const THEME_KEY = "gym.theme";

export function getTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) ?? "dark";
  } catch {
    return "dark";
  }
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#111110" : "#fcfcfb");
}

// Runs before paint (inlined in <head>) so there's no flash of the wrong theme.
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}")||"dark";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){document.documentElement.classList.add("dark")}`;
