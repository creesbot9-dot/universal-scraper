import { exec } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const SCRAPER_DIR = join(homedir(), ".openclaw/workspace/skills/universal-scraper");

const universalScraper = {
  id: "universal-scraper",
  name: "Universal Web Scraper",
  description: "Scrape any website, learn sites, extract data",
  configSchema: { parse: (v) => v ?? {} },
  register(api) {
    api.registerTool({
      name: "scrape_website",
      label: "Universal Web Scraper",
      description: "Scrape a website, learn it, or use a learned configuration. Use for: scraping any URL, extracting data, learning sites for future, monitoring content changes.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape (optional if using --use)" },
          action: { 
            type: "string", 
            enum: ["scrape", "learn", "use", "list", "refresh", "forget"],
            description: "Action to perform" 
          },
          name: { type: "string", description: "Name for learned site (used with learn/use)" },
          stealth: { type: "boolean", description: "Use stealth mode to avoid detection" },
          wait: { type: "number", description: "Wait milliseconds before extracting" },
          selector: { type: "string", description: "CSS selector to extract" },
        },
        required: ["action"],
      },
      execute: async function (toolCallId, params) {
        return new Promise((resolve, reject) => {
          const args = [];
          
          // Build command arguments
          if (params.url) args.push(params.url);
          
          switch (params.action) {
            case "learn":
              args.push("--learn", params.name);
              break;
            case "use":
              args.push("--use", params.name);
              break;
            case "list":
              args.push("--learned");
              break;
            case "refresh":
              args.push("--refresh", params.name);
              break;
            case "forget":
              args.push("--forget", params.name);
              break;
            case "scrape":
            default:
              // Just scrape the URL
              break;
          }
          
          if (params.stealth) args.push("--stealth");
          if (params.wait) args.push("--wait", params.wait.toString());
          if (params.selector) args.push("--selector", params.selector);
          
          const cmd = `cd ${SCRAPER_DIR} && node scraper.js ${args.join(" ")}`;
          
          exec(cmd, { maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Scraper error: ${error.message}\n${stderr}`));
            } else {
              resolve({
                content: [{ type: "text", text: stdout || stderr }],
              });
            }
          });
        });
      },
    });
  },
};

export default universalScraper;
