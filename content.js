async function fetchBlockedWords() {
  const fileURL = chrome.runtime.getURL("nsfw-words.json");
  try {
    // Fetch blocked words from the JSON file
    const response = await fetch(fileURL);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const blockedWordsFromFile = await response.json();

    // Fetch additional blocked words from Chrome storage
    const blockedWordsFromStorage = await new Promise((resolve) => {
      chrome.storage.sync.get("blockedWords", (result) => {
        resolve(result.blockedWords || []);
      });
    });

    console.log("blockedWordsFromStorage", blockedWordsFromStorage);

    // Combine both sources (file + Chrome storage) and return the result
    const allBlockedWords = [
      ...new Set([...blockedWordsFromFile, ...blockedWordsFromStorage]),
    ]; // Remove duplicates
    return allBlockedWords;
  } catch (error) {
    console.error("Error fetching blocked words:", error);
    return [];
  }
}

async function fetchBlockedUrls() {
  const fileURL = chrome.runtime.getURL("nsfw-urls.json");
  try {
    // Fetch blocked URLs from the JSON file
    const response = await fetch(fileURL);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const blockedUrlsFromFile = await response.json();

    // Fetch additional blocked URLs from Chrome storage
    const blockedUrlsFromStorage = await new Promise((resolve) => {
      chrome.storage.sync.get("blockedUrls", (result) => {
        resolve(result.blockedUrls || []);
      });
    });

    console.log("blockedUrlsFromStorage", blockedUrlsFromStorage);

    // Combine both sources (file + Chrome storage) and return the result
    const allBlockedUrls = [
      ...new Set([...blockedUrlsFromFile, ...blockedUrlsFromStorage]),
    ]; // Remove duplicates
    return allBlockedUrls;
  } catch (error) {
    console.error("Error fetching blocked URLs:", error);
    return [];
  }
}

function blurElement(element) {
  if (element && element.style) {
    element.style.filter = "blur(8px)";
    element.style.pointerEvents = "none";
    element.title = "Blocked Content";
  }
}

// Redirect users if they are already on a blocked site
async function redirectIfOnBlockedSite() {
  const BLOCKED_URLS = await fetchBlockedUrls(); // Fetch the list of blocked URLs
  const currentHostname = window.location.hostname.toLowerCase(); // Get the current site's hostname

  // Check if the current hostname matches any blocked URL
  console.log("currentHostname", currentHostname);
  console.log(
    "block",
    BLOCKED_URLS.some((blockedUrl) =>
      currentHostname.includes(blockedUrl.toLowerCase())
    )
  );

  if (
    BLOCKED_URLS.some((blockedUrl) =>
      currentHostname.includes(blockedUrl.toLowerCase())
    )
  ) {
    console.log("Redirecting to blocked.html due to a blocked site...");
    console.log(
      "Redirecting to:",
      new URL("blocked.html", window.location.origin).href
    );

    window.location.href = chrome.runtime.getURL("blocked.html"); // Redirect to the warning page
  }
}

// Dynamic function to scan for NSFW words in URLs and reroute
async function scanForBlockedURLs() {
  const BLOCKED_URLS = await fetchBlockedUrls(); // Fetch blocked URLs
  const links = document.querySelectorAll("a"); // Select all anchor elements

  links.forEach((link) => {
    let linkHref;

    try {
      // Extract hostname from the link
      linkHref = new URL(link.href).hostname.toLowerCase();
    } catch (error) {
      console.debug("Skipping invalid link:", link.href);
      return; // Skip invalid links
    }

    // Check if the link's hostname matches any blocked URL
    if (
      BLOCKED_URLS.some((blockedUrl) => {
        linkHref.includes(blockedUrl.toLowerCase());
      })
    ) {
      console.log(`Blocked link detected: ${linkHref}`);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        console.log(`Redirecting from blocked link: ${linkHref}`);
        window.location.href = chrome.runtime.getURL("blocked.html"); // Redirect on click
      });

      // Blur the link
      // blurElement(link);
    }
  });
}
async function scanForBlockedWords() {
  const BLOCKED_WORDS = await fetchBlockedWords();
  const wordRegex = new RegExp(`\\b(${BLOCKED_WORDS.join("|")})\\b`, "gi");

  const textNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let currentNode;
  while ((currentNode = walker.nextNode())) {
    textNodes.push(currentNode);
  }

  // Process nodes in chunks
  const processChunk = (startIndex, chunkSize) => {
    for (
      let i = startIndex;
      i < startIndex + chunkSize && i < textNodes.length;
      i++
    ) {
      const node = textNodes[i];
      const originalText = node.nodeValue;

      if (wordRegex.test(originalText)) {
        const blurredHTML = originalText.replace(wordRegex, (match) => {
          return `<span class="blurred-word" title="Blocked">${match}</span>`;
        });

        const parentElement = node.parentNode;

        // Ensure the parent node exists
        if (parentElement) {
          const newElement = document.createElement("span");
          newElement.innerHTML = blurredHTML;
          parentElement.replaceChild(newElement, node);
        }
      }
    }

    if (startIndex + chunkSize < textNodes.length) {
      setTimeout(() => processChunk(startIndex + chunkSize, chunkSize), 0);
    }
  };

  // Start processing in chunks of 50 nodes
  processChunk(0, 50);

  // Blur images, videos that contain NSFW words in their alt, title, or src attributes
  const images = document.querySelectorAll("img");
  const videos = document.querySelectorAll("video");

  images.forEach((img) => {
    const { alt, title, src } = img;
    const containsBlockedWord = [alt, title, src].some((attr) =>
      wordRegex.test(attr || "")
    );

    if (containsBlockedWord) {
      blurImage(img);
    }
  });

  videos.forEach((video) => {
    const { poster, title, src } = video;
    const containsBlockedWord = [poster, title, src].some((attr) =>
      wordRegex.test(attr || "")
    );

    if (containsBlockedWord) {
      blurImage(video);
    }
  });
}

// Function to blur an image and add a "View Anyway" button
function blurImage(element) {
  // Check if a wrapper already exists for this image
  const existingWrapper = element.parentNode.classList.contains("blur-wrapper");

  if (existingWrapper) {
    console.warn("Button already exists for this image, skipping creation.");
    return; // Exit if the wrapper is already present
  }

  if (element.tagName.toLowerCase() === "video" && element.poster) {
    element.poster = element.poster; // To trigger a change in the poster image (if any)
  }

  const isInsideLink = element.closest("a");

  // Create a wrapper for the image and button
  const wrapper = document.createElement("div");
  wrapper.classList.add("blur-wrapper");
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-block";

  // Clone the original image to avoid modifying it directly
  const blurredImage = element.cloneNode(true);
  blurredImage.style.filter = "blur(18px)";
  blurredImage.style.pointerEvents = "none";
  blurredImage.style.transition = "filter 0.3s";

  // Create the "View Anyway" button
  const button = document.createElement("button");
  button.textContent = "View Anyway";
  button.style.position = "absolute";
  button.style.top = "50%";
  button.style.left = "50%";
  button.style.transform = "translate(-50%, -50%)";
  button.style.background = "rgb(140 140 140 / 54%)";
  button.style.color = "black";
  button.style.fontWeight = "bold";
  button.style.fontSize = "10px";
  button.style.border = "1px solid #0000003b";
  button.style.padding = "6px 10px";
  button.style.cursor = "pointer";
  button.style.borderRadius = "5px";

  // Add event listener to unblur the image when the button is clicked
  button.addEventListener("click", (event) => {
    blurredImage.style.filter = "none";
    button.style.display = "none";
    if (isInsideLink) {
      event.preventDefault(); // Prevent the link from being followed
    }
  });

  // Replace the original image with the wrapper containing the blurred image and button
  element.parentNode.replaceChild(wrapper, element);
  wrapper.appendChild(blurredImage);
  wrapper.appendChild(button);
}

// Add CSS for blurred words
const style = document.createElement("style");
style.textContent = `
    .blurred-word {
      filter: blur(5px);
      cursor: not-allowed;
      pointer-events: none;
      user-select: none;
    }
  `;
document.head.appendChild(style);

// Throttling function to avoid frequent re-scans
function throttle(fn, delay) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

// Scan the page initially
scanForBlockedWords();

// Monitor changes to the page for dynamic content (e.g., infinite scrolling)
const observer = new MutationObserver(
  throttle(async () => {
    await redirectIfOnBlockedSite(); // Check if the user is already on a blocked site
    await scanForBlockedURLs(); // Scan and handle blocked URLs in links
    scanForBlockedWords();
  }, 500) // Throttle scans to once every 500ms
);
observer.observe(document.body, { childList: true, subtree: true });
