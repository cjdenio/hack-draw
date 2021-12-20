import { writeFile, readFile, mkdir } from "fs/promises";

export default class LineDb {
  constructor() {
    this.lines = [];
  }

  async init() {
    try {
      await mkdir("./storage");
    } catch (e) {}

    try {
      this.lines = JSON.parse(await readFile("./storage/lines.json"));
    } catch (e) {}
  }

  async push(line) {
    this.lines.push(line);
    this.update();
  }

  async clear() {
    this.lines = [];
    this.update();
  }

  async update() {
    await writeFile("./storage/lines.json", JSON.stringify(this.lines));
  }
}
