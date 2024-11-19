// Cookies needed to check if user is signed into Letterboxd
const cookieNames = [
    'letterboxd.signed.in.as'
];

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
        // Checks if extension user is on valid site
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes("letterboxd.com")) {


            // Check if user is logged in based on their cookies for letterboxd.com
            let isLoggedIn = await checkCookies();

            // Check if user has taste meter enabled
            let tasteMeterEnabled = await getMeterToggle();

            const urlPattern = /^https:\/\/letterboxd\.com\/[^\/]+\/(\?.*)?$/;

            // If they are logged in run extension normally
            if (tasteMeterEnabled && isLoggedIn && tab.url.includes("letterboxd.com/film")) {
                chrome.tabs.sendMessage(tabId, { type: "movie" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else {
                        console.log(response);
                    }
                });
            }else if(tasteMeterEnabled && isLoggedIn && urlPattern.test(tab.url)){
                chrome.tabs.sendMessage(tabId, { type: "profile" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else {
                        console.log(response);
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error checking cookies:', error);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type } = message;

    // Checks if valid login cookies are found
    if (type === "checkCookies") {
        checkCookies().then(isLoggedIn => {
            sendResponse({ isLoggedIn: isLoggedIn });
        }).catch(error => {
            console.error("Error checking cookies:", error);
            sendResponse({ isLoggedIn: false }); // Default to false on error
        });

        // Return true to indicate that the response will be sent asynchronously
        return true;
    } else if (type === "updateMeterToggle") {
        const { data } = message;
        updateMeterToggle(data);
    } else if (type === "getMeterToggle") {
        getMeterToggle().then(tasteMeterState => {
            sendResponse(tasteMeterState);
        }).catch(error => {
            console.error("Error getting meter toggle:", error);
            sendResponse(false); // Default to false on error
        });

        // Return true to indicate that the response will be sent asynchronously
        return true;
    }
});


// Updates the meter toggle state in chrome local storage
function updateMeterToggle(toggleState) {
    chrome.storage.sync.set({ isMeterToggled: toggleState }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error updating meter toggle:", chrome.runtime.lastError);
        }
    });
}

// Gets the meter toggle state from chrome local storage
function getMeterToggle() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(["isMeterToggled"], (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                // If toggle state exists in storge, resolve, else update storage
                if (result.hasOwnProperty("isMeterToggled")) {
                    resolve(result.isMeterToggled);
                } else {
                    updateMeterToggle(false);
                    resolve(false);
                }
            }
        });
    });
}

// Loops through and checks if valid log in cookies found
function checkCookies() {
    return new Promise((resolve, reject) => {
        let isLoggedIn = true;
        let pendingChecks = cookieNames.length;

        cookieNames.forEach(name => {
            chrome.cookies.get({ url: 'https://letterboxd.com', name: name }, function (cookie) {
                if (!cookie) {
                    isLoggedIn = false;
                    console.log(`Cookie ${name} not found`);
                }
                pendingChecks--;

                if (pendingChecks === 0) {
                    resolve(isLoggedIn);
                }
            });
        });
    });
}
