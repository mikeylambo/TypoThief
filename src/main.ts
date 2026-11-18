import "./view/styles.css";
import { createPlatform } from "./platform/index.ts";
import { App } from "./view/App.ts";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app mount element");
}

const platform = createPlatform();
const app = new App(root, platform);
void app.start();
