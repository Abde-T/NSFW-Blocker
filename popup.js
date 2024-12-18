document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup initialized.");

  // Modal helper functions
  const showModal = (message) => {
    const modal = document.getElementById("modal");
    const modalMessage = document.getElementById("modal-message");
    modalMessage.textContent = message;
    modal.style.display = "block";
    console.log("Modal is now visible");
  };

  const hideModal = () => {
    const modal = document.getElementById("modal");
    modal.style.display = "none";
  };

  // Event listener to close the modal
  document.getElementById("modal-close").addEventListener("click", hideModal);
  window.addEventListener("click", (event) => {
    const modal = document.getElementById("modal");
    if (event.target === modal) {
      hideModal();
    }
  });

  // Toggle switch listener
  const toggleSwitch = document.querySelector(
    ".toggle-switch input[type='checkbox']"
  );

  toggleSwitch.addEventListener("change", () => {
    localStorage.setItem("blockerEnabled", JSON.stringify(toggleSwitch.checked));
    if (toggleSwitch.checked) {
      showModal("Blocker functions have been enabled.");
    } else {
      showModal("Blocker functions have been disabled.");
    }
  });

  // Helper functions
  const getById = (id) => document.getElementById(id);
  const saveToStorage = (key, value, callback = () => {}) => {
    console.log([key], value);

    chrome.storage.sync.set({ [key]: value }, callback);
  };
  const getFromStorage = (key, callback) => {
    chrome.storage.sync.get([key], (result) => callback(result[key] || []));
  };

  // Update text area with current storage values
  const initializeTextAreas = () => {
    getFromStorage("blockedWords", (words) => {
      getById("blocked-word").value = words.join("\n");
    });
    getFromStorage("blockedUrls", (urls) => {
      getById("blocked-url").value = urls.join("\n");
    });
  };

  // Save words/URLs to storage
  const saveItems = (key, inputId) => {
    const items = getById(inputId)
      .value.split("\n")
      .map((item) => item.trim())
      .filter((item) => item);

    if (items.length === 0) {
      showModal(`No items to add. Please enter valid words or URLs.`);
      return;
    }

    saveToStorage(key, items, () => {
      // Verify the items were successfully saved
      getFromStorage(key, (savedItems) => {
        if (JSON.stringify(savedItems) === JSON.stringify(items)) {
          showModal(`Items successfully added.`);
        } else {
          showModal(`Error: Failed to save items. Please try again.`);
        }
      });
    });
  };
  // Remove a specific word/URL from storage
  const unblockItem = (key, inputId) => {
    const itemToUnblock = getById(inputId).value.trim();
    if (!itemToUnblock) {
      showModal(`Please enter a valid word or URL to unblock.`);
      return;
    }

    getFromStorage(key, (items) => {
      if (!items.includes(itemToUnblock)) {
        showModal(`${itemToUnblock} not found in the blocked list.`);
        return;
      }

      const updatedItems = items.filter((item) => item !== itemToUnblock);
      saveToStorage(key, updatedItems, () => {
        // Verify the item was successfully removed
        getFromStorage(key, (newItems) => {
          if (!newItems.includes(itemToUnblock)) {
            showModal(`${itemToUnblock} has been successfully removed.`);
          } else {
            showModal(
              `Error: Failed to remove ${itemToUnblock}. Please try again.`
            );
          }
        });
      });
    });
  };

  // Event listeners
  getById("save").addEventListener("click", (event) => {
    event.preventDefault();
    saveItems("blockedWords", "blocked-word");
    saveItems("blockedUrls", "blocked-url");
  });

  getById("unblock-word-button").addEventListener("click", (event) => {
    event.preventDefault();
    unblockItem("blockedWords", "unblock-word");
  });

  getById("unblock-url-button").addEventListener("click", (event) => {
    event.preventDefault();
    unblockItem("blockedUrls", "unblock-url");
  });

  // Initialize text areas on load
  // initializeTextAreas();
});
