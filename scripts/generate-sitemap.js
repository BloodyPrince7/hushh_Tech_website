import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_URL = "https://hushhTech.com";
const SITEMAP_PATH = path.join(__dirname, "../public/sitemap.xml");
const staticPages = ["/", "/about", "/contact", "/blog", "/privacy-policy", "/terms-of-service"];

// Additional community routes based on observed URL structure in posts.ts
const communityRoutes = [
  // Market updates
  "/community/daily-market-update/10-apr-2025",
  "/community/daily-market-update/11-apr-2025",
  "/community/daily-market-update/15-apr-2025",
  "/community/daily-market-update/16-apr-2025",
  "/community/daily-market-update/17-apr-2025",
  "/community/daily-market-update/14-feb-2025",
  "/community/market/daily-market-update",
  "/community/market/updates",
  "/community/market/alpha-aloha-fund-update",
  "/community/market/weekly-report",
  "/community/market/feb-5-market-update",
  "/community/market/latest-fund-update-11th-feb",
  "/community/market/updates-28-feb-2025",
  "/community/market/market-updates-1st-april",
  "/community/market/market-updates-4th-april",
  "/community/market/market-update-19-feb",
  "/community/market/market-update-20-feb",
  "/community/market/daily-update-30-may",
  
  // Funds
  "/community/funds/hushh-technology-fund",
  "/community/funds/renaissance-tech",
  "/community/funds/fund-ahushh",
  "/community/funds/fee-schedule",
  "/community/funds/alpha-aloha-fund-update-feb6",
  "/community/funds/hushh-alpha-fund-nav-update",
  
  // General
  "/community/general/manifesto",
  "/community/general/ai-infrastructure-thesis",
  "/community/general/fund-afaq",
  "/community/general/hushh-fund-faq",
  "/community/general/hushh-employee-champion-handbook",
  "/community/general/hushhtech-prospectus",
  "/community/general/compensation-report",
  
  // Product updates
  "/community/product/product-updates",
  "/community/product/hushh-wallet",
  "/community/product/renaissance-tech",
  
  // Investor relations
  "/community/investor-relations/investor-faq/charlie-munger-edition",
  "/community/investors-faq/shared-class-explanation",
  "/community/investors-faq/withdrawal-schedule",
  "/community/investors-faq/investor-suitability-questionnarie",
  "/community/investors-news/market-wrap",
  "/community/investment-strategies/sell-the-wall",
  "/community/investment-strategy/hushh-alpha-fund-growth-plan",
  "/community/investment-strategy/investment-framework-renting-maximum-income",
  "/community/news/investment-perspective"
];

function readExistingLastMods() {
  const candidateContents = [];

  try {
    candidateContents.push(execSync("git show HEAD:public/sitemap.xml", { encoding: "utf8" }));
  } catch {
    // Fall back to the current working-tree sitemap when the repo has no tracked file yet.
  }

  if (fs.existsSync(SITEMAP_PATH)) {
    candidateContents.push(fs.readFileSync(SITEMAP_PATH, "utf8"));
  }

  for (const existingSitemap of candidateContents) {
    const entries = [...existingSitemap.matchAll(/<url>\s*<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/gs)];
    if (entries.length > 0) {
      return new Map(entries.map(([, loc, lastmod]) => [loc.trim(), lastmod.trim()]));
    }
  }

  return new Map();
}

function getStableLastMod(existingLastMods, url, fallbackLastMod) {
  return existingLastMods.get(url) || fallbackLastMod;
}

const generateSitemap = () => {
  console.log("🔹 Generating sitemap...");
  const existingLastMods = readExistingLastMods();
  const fallbackLastMod = fs.statSync(path.join(__dirname, "../package.json")).mtime.toISOString();
  const scannedPostLastMods = new Map();

  // Generate URLs for static pages
  const staticUrls = staticPages.map((page) => {
    const url = `${SITE_URL}${page}`;
    return `
      <url>
        <loc>${url}</loc>
        <lastmod>${getStableLastMod(existingLastMods, url, fallbackLastMod)}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.7</priority>
      </url>`;
  });

  // Additionally, scan directories for any posts that might not be included
  const postUrls = [];
  let postCount = 0;
  
  // Directories containing community posts
  const publicPostDirectories = [
    path.join(__dirname, "../src/content/posts/market"),
    path.join(__dirname, "../src/content/posts/funds"),
    path.join(__dirname, "../src/content/posts/general"),
    path.join(__dirname, "../src/content/posts/investors-faq"),
    path.join(__dirname, "../src/content/posts/product")
  ];
  
  // Process each public directory
  publicPostDirectories.forEach(directory => {
    if (fs.existsSync(directory)) {
      // Get the category name from the directory path
      const category = path.basename(directory);
      
      // Get all the files in the directory
      const files = fs.readdirSync(directory);
      
      files.forEach(file => {
        // Skip if not a .tsx or .jsx file
        if (!file.endsWith('.tsx') && !file.endsWith('.jsx')) return;
        
        // Get the file name without extension to use as a slug part
        const fileName = path.basename(file, path.extname(file));
        
        // Create a slug for the post (convert to kebab-case if needed)
        const slug = fileName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        
        // Use file's modified date as lastmod
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);
        const lastMod = stats.mtime.toISOString();
        const url = `${SITE_URL}/community/${category}/${slug}`;
        scannedPostLastMods.set(url, lastMod);
        
        // Add URL entry for the post
        postUrls.push(`
      <url>
        <loc>${url}</loc>
        <lastmod>${lastMod}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
      </url>`);
        
        postCount++;
      });
    }
  });

  // Generate URLs for community routes with deterministic lastmod values.
  const communityUrls = communityRoutes.map((route) => {
    const url = `${SITE_URL}${route}`;
    const lastMod =
      scannedPostLastMods.get(url) || getStableLastMod(existingLastMods, url, fallbackLastMod);
    return `
      <url>
        <loc>${url}</loc>
        <lastmod>${lastMod}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
      </url>`;
  });

  // Combine all URLs
  const allUrls = [...staticUrls, ...communityUrls, ...postUrls].join("\n");

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${allUrls}
    </urlset>`;

  fs.writeFileSync(SITEMAP_PATH, sitemapContent);

  console.log(`✅ Sitemap successfully generated at ${SITEMAP_PATH}`);
  console.log(`✅ Added ${staticUrls.length} static pages, ${communityUrls.length} community pages, and ${postCount} scanned posts`);
  console.log(`🔎 Verifying file: ${fs.existsSync(SITEMAP_PATH) ? "✅ Exists" : "❌ Not Found"}`);
};

generateSitemap();
