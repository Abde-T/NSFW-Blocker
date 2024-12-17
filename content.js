// Function to fetch blocked words
async function fetchBlockedWords() {
  if (chrome?.runtime?.id) {
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
          if (chrome.runtime.lastError) {
            console.error(
              "Error accessing storage:",
              chrome.runtime.lastError.message
            );
            return;
          }
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
  } else {
    console.error("Chrome runtime context is invalidated.");
  }
}
// Function to fetch blocked URLs
async function fetchBlockedUrls() {
  if (chrome?.runtime?.id) {
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
  } else {
    console.error("Chrome runtime context is invalidated.");
  }
}

// Listener to dynamically update data on chrome.storage change
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "sync") {
    if (changes.blockedWords) {
      await fetchBlockedWords();
      await scanForBlockedWords();
    } else {
      console.log(
        "Skipping blockedWords scan because scanForBlockedURLs is running."
      );
    }
  }
  if (changes.blockedUrls) {
    await fetchBlockedUrls();
    await scanForBlockedURLs();
  } else {
    console.log(
      "Skipping blockedUrls scan because scanForBlockedWords is running."
    );
  }
});

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

  const isBlocked = BLOCKED_URLS.some((blockedUrl) => {
    const normalizedBlockedUrl = blockedUrl.toLowerCase();
    return currentHostname === normalizedBlockedUrl;
  });
  console.log("block", isBlocked);

  if (isBlocked) {
    window.location.href = chrome.runtime.getURL("blocked.html"); // Redirect to the warning page
  }
}

// Dynamic function to scan for NSFW words in URLs and reroute
async function scanForBlockedURLs() {
  const BLOCKED_URLS = await fetchBlockedUrls(); // Fetch blocked URLs
  const links = document.querySelectorAll("a"); // Select all anchor elements

  links.forEach((link) => {
    try {
      const linkHostname = new URL(link.href).hostname.toLowerCase(); // Extract hostname

      const isBlocked = BLOCKED_URLS.some((blockedUrl) => {
        const normalizedBlockedUrl = blockedUrl.toLowerCase();
        return linkHostname === normalizedBlockedUrl; // Ensure exact hostname match
      });

      if (isBlocked) {
        console.log(`Blocked link detected: ${link.href}`);
        link.addEventListener("click", (event) => {
          event.preventDefault(); // Prevent navigation
          console.log(`Redirecting from blocked link: ${link.href}`);
          window.location.href = chrome.runtime.getURL("blocked.html");
        });

        // Optional: Blur or visually mark blocked links
        blurElement(link);
      }
    } catch (error) {
      // Handle invalid URLs gracefully
      console.log("Invalid URL detected in link:", link.href);
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
          parentElement?.replaceChild(newElement, node);
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
    console.log("Button already exists for this image, skipping creation.");
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
    scanForBlockedWords();
    await scanForBlockedURLs(); // Scan and handle blocked URLs in links
  }, 500) // Throttle scans to once every 500ms
);
observer.observe(document.body, { childList: true, subtree: true });
