module.exports = function(eleventyConfig) {
  // Ignore legacy markdown builds - now using Sanity data via src/cars.njk
  eleventyConfig.ignores.add("src/builds/**");
  eleventyConfig.ignores.add("src/builds-legacy/**");

  // Passthrough copy - preserve existing static assets
  // These are copied from root to _site
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("images");
  // optimized_images removed - hero images now served from Cloudinary
  // admin removed - Netlify CMS replaced by Sanity
  // Note: cars/ pages are generated from Sanity CMS data
  // via src/cars.njk pagination template using src/_data/builds.json

  // Preserve existing root HTML pages (static ones only)
  // Note: our-work.html and the-cars.html are now generated from Nunjucks templates
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("about.html");
  eleventyConfig.addPassthroughCopy("contact.html");
  eleventyConfig.addPassthroughCopy("videos.html");
  eleventyConfig.addPassthroughCopy("testimonials.html");
  eleventyConfig.addPassthroughCopy("open-houses.html");

  // Custom filter to count gallery images
  eleventyConfig.addFilter("length", function(arr) {
    return arr ? arr.length : 0;
  });

  // Image URL filter - handles both Cloudinary URLs and local filenames
  // If already a full URL, returns as-is. Otherwise prepends local path.
  eleventyConfig.addFilter("imageUrl", function(image) {
    if (!image) return '';
    // If already a full URL (Cloudinary or other), use as-is
    if (image.startsWith('http://') || image.startsWith('https://')) {
      return image;
    }
    // Cloudinary public ID (e.g. cookersvdubs/img-e3216) — build full URL
    if (image.startsWith('cookersvdubs/')) {
      return `https://res.cloudinary.com/ds3b5nqnd/image/upload/${image}.jpg`;
    }
    // Legacy local filename - return fallback (all images should now be Cloudinary URLs)
    console.warn(`Warning: Local image reference found: ${image}`);
    return `https://res.cloudinary.com/ds3b5nqnd/image/upload/v1773886760/cookersvdubs/site-assets/fallback-header.jpg`;
  });

  // Filter to get status CSS class
  eleventyConfig.addFilter("statusClass", function(status) {
    const map = {
      "completed": "status-complete",
      "in-progress": "status-progress",
      "personal-ride": "status-personal"
    };
    return map[status] || "status-complete";
  });

  // Filter to get status display text
  eleventyConfig.addFilter("statusText", function(status) {
    const map = {
      "completed": "Complete",
      "in-progress": "In Progress",
      "personal-ride": "Personal Ride"
    };
    return map[status] || "Complete";
  });

  // Filter to get back link based on status
  eleventyConfig.addFilter("backLink", function(status) {
    if (status === "in-progress") return "../the-cars.html";
    if (status === "personal-ride") return "../the-cars.html#personal";
    return "../our-work.html";
  });

  // Filter to get back link text based on status
  eleventyConfig.addFilter("backLinkText", function(status) {
    if (status === "in-progress") return "In Progress";
    if (status === "personal-ride") return "Personal Rides";
    return "Our Work";
  });

  // Filter to format model name for display
  eleventyConfig.addFilter("modelDisplay", function(model) {
    const map = {
      "Beetle": "Beetle",
      "Bus-Transporter": "Bus / Transporter",
      "Karmann-Ghia": "Karmann Ghia",
      "Type-3": "Type 3",
      "Single-Cab": "Single Cab",
      "Double-Cab": "Double Cab",
      "Thing": "Thing",
      "Custom-Hot-Rod": "Custom / Hot Rod",
      "Porsche-356": "Porsche 356",
      "Panel-Van": "Panel Van"
    };
    return map[model] || model;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
