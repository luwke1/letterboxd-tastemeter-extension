
function updateScreen() {
    try {
        checkLoggedIn();

        updateMeterToggleElement();

    } catch (error) {
        console.error("Error updating screen:", error);
    }
}

async function checkLoggedIn() {
    // Send a message and check if user is logged in
    const response = await chrome.runtime.sendMessage({ type: "checkCookies" });
    const isLoggedIn = response.isLoggedIn;

    const logInSpan = document.querySelector(".log-in");
    const toggleElement = document.querySelector(".switch-box");

    // If they are not logged in, tell user to log in, otherwise display meter toggle
    if (isLoggedIn) {
        logInSpan.hidden = true;
        toggleElement.hidden = false;
    } else {
        logInSpan.hidden = false;
        toggleElement.hidden = true;
    }
}

async function updateMeterToggleElement() {
    // Get the current toggle state from chrome local storage
    var tasteMeterState = await chrome.runtime.sendMessage({ type: "getMeterToggle" });


    // Select toggle switch element
    const switchElement = document.querySelector('#toggleMeter');

    switchElement.checked = tasteMeterState;

    // Create event listener to update toggle state in chrome storage
    switchElement.addEventListener('change', () => {
        let newState = switchElement.checked

        if (newState) {
            console.log("Taste Meter Enabled");
        } else {
            console.log("Taste Meter Disabled");
        }

        chrome.runtime.sendMessage({ type: "updateMeterToggle", data: newState });
    });
}

// Call updateScreen when the popup is loaded
document.addEventListener("DOMContentLoaded", updateScreen);