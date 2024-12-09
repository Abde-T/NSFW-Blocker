
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded event fired.");

  // Retrieve and display the current blocked words and URLs from Chrome Storage
  chrome.storage.sync.get(["blockedWords", "blockedUrls"], (result) => {
    const blockedWords = result.blockedWords || [];
    const blockedUrls = result.blockedUrls || [];

    document.getElementById("blocked-words").value = blockedWords.join("\n");
    document.getElementById("blocked-urls").value = blockedUrls.join("\n");
  });

  const saveButton = document.getElementById("save");

  saveButton.addEventListener("click", () => {
    const blockedWords = document
      .getElementById("blocked-words")
      .value.split("\n")
      .map(word => word.trim())
      .filter(word => word !== "");

    const blockedUrls = document
      .getElementById("blocked-urls")
      .value.split("\n")
      .map(url => url.trim())
      .filter(url => url !== "");

    // Save to Chrome Storage
    chrome.storage.sync.set(
      { blockedWords, blockedUrls },
      () => {
        console.log("Blocked words and URLs saved successfully.");
        alert("Settings saved!");
      }
    );
  });

  const unblockWordButton = document.getElementById("unblock-word-button");
  unblockWordButton.addEventListener("click", () => {
    const wordToUnblock = document.getElementById("unblock-word").value.trim();
    if (!wordToUnblock) return;

    chrome.storage.sync.get("blockedWords", (result) => {
      let blockedWords = result.blockedWords || [];
      blockedWords = blockedWords.filter((word) => word !== wordToUnblock);

      // Save the updated list to Chrome Storage
      chrome.storage.sync.set({ blockedWords }, () => {
        console.log(`Word "${wordToUnblock}" unblocked.`);
        alert(`Word "${wordToUnblock}" has been unblocked.`);
      });
    });
  });

  const unblockUrlButton = document.getElementById("unblock-url-button");
  unblockUrlButton.addEventListener("click", () => {
    const urlToUnblock = document.getElementById("unblock-url").value.trim();
    if (!urlToUnblock) return;

    chrome.storage.sync.get("blockedUrls", (result) => {
      let blockedUrls = result.blockedUrls || [];
      blockedUrls = blockedUrls.filter((url) => url !== urlToUnblock);

      // Save the updated list to Chrome Storage
      chrome.storage.sync.set({ blockedUrls }, () => {
        console.log(`URL "${urlToUnblock}" unblocked.`);
        alert(`URL "${urlToUnblock}" has been unblocked.`);
      });
    });
  });
});