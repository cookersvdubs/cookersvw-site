module.exports = function(eleventyConfig) {
  // Passthrough copy - preserve existing static assets
  // These are copied from root to _site
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("optimized_images");
  eleventyConfig.addPassthroughCopy("admin");
  // Note: cars/ pages are now generated from src/builds/ markdown files

  // Preserve existing root HTML pages
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("about.html");
  eleventyConfig.addPassthroughCopy("contact.html");
  eleventyConfig.addPassthroughCopy("our-work.html");
  eleventyConfig.addPassthroughCopy("the-cars.html");
  eleventyConfig.addPassthroughCopy("videos.html");
  eleventyConfig.addPassthroughCopy("testimonials.html");
  eleventyConfig.addPassthroughCopy("open-houses.html");

  // Custom filter to count gallery images
  eleventyConfig.addFilter("length", function(arr) {
    return arr ? arr.length : 0;
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
