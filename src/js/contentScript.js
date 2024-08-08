async function getTasteScore(userLink) {
    try {
        // Fetch user reviews
        const reviewData = await fetchUserReviews(userLink);

        // Fetch extension user reviews data
        const adminUserReviews = await fetchExtensionUserRatings(reviewData, userLink);

        // Calculate and return the taste score
        return calculateTasteScore(reviewData, adminUserReviews);
        
    } catch (error) {
        console.error('User rating fetch error:', error);
    }
}

// Fetches user reviews sorted by extension users highest ratings
async function fetchUserReviews(userLink) {
    const response = await fetch(`https://letterboxd.com${userLink}films/by/your-rating/`, { credentials: "include" });
    if (!response.ok) {
        throw new Error(`Failed to fetch reviews for ${userLink}: ${response.statusText}`);
    }
    const text = await response.text();

    // Parse the HTML response into DOM object
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(text, "text/html");

    // Select all user reviews sorted by highest rating
    const reviews = newDoc.querySelectorAll('.poster-container');
    const reviewData = {};

    // Extract film ID and ratings for each user review
    reviews.forEach((review) => {
        const filmID = review.querySelector(".poster").getAttribute("data-film-id");
        const filmRating = review.querySelector(".rating");

        // Skip if there is no rating for the film
        if (!filmRating) {
            return;
        }

        const ratingText = filmRating.getAttribute("class");
        const ratingMatch = ratingText.match(/rated-(\d+)/);
        
        if (ratingMatch) {
            const userRating = parseFloat(ratingMatch[1]);
            reviewData[filmID] = userRating; // Store the filmID and rating
        }
    });

    return reviewData;
}

// Fetches extension user reviews based on the other users review data
async function fetchExtensionUserRatings(reviewData, userLink) {
    const url = "https://letterboxd.com/ajax/letterboxd-metadata/";
    const headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://letterboxd.com",
        "Referer": `https://letterboxd.com${userLink}films/by/your-rating/`,
        "X-Requested-With": "XMLHttpRequest"
    };

    // Create URLSearchParams for POST request
    const params = new URLSearchParams();
    const posterIds = Object.keys(reviewData);

    // Append film IDs and likeable film IDs to the params
    posterIds.forEach(id => {
        params.append('posters', id);
        params.append('likeables', `film:${id}`);
    });

    // Fetch extension users reviews data using the POST request
    const userResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: params,
        credentials: "include"
    });

    if (!userResponse.ok) {
        throw new Error(`Failed to fetch extension users reviews: ${userResponse.statusText}`);
    }

    // Parse the JSON response to get extension user reviews
    const jsonData = await userResponse.json();
    return jsonData.filmRatings;
}

// Calculate the Mean Absolute Difference and return the taste score
function calculateTasteScore(reviewData, adminUserReviews) {
    let sharedRatings = 0;
    let totalDifference = 0;

    // Calculate MAD for shared ratings
    for (const [key, adminUserRating] of Object.entries(adminUserReviews)) {
        if (sharedRatings >= 50) {
            break;
        }
        // Extract film ID from key
        const adminUserReviewID = key.slice(5); 

        // Check if extension user has rated the same film
        if (adminUserReviewID in reviewData) {
            const userRating = reviewData[adminUserReviewID];
            totalDifference += Math.abs(adminUserRating - userRating);
            sharedRatings++;
        }
    }

    // Check for enough shared ratings
    if (sharedRatings >= 15) {
        const mad = totalDifference / sharedRatings; // Calculate the Mean Absolute Difference
        const maxDifference = 4.5;
        const similarityScore = Math.floor((1 - (mad / maxDifference)) * 100); // Normalize to scale of 0-100%
        return { tasteScore: similarityScore, sharedRatings: sharedRatings };
    } else {
        return { tasteScore: "NOT ENOUGH INFO", sharedRatings: sharedRatings };
    }
}

async function displayTasteMeter() {
    // Grab all the displayed reviews
    var userObjects = document.querySelectorAll(".film-detail");

    // Process each user object sequentially
    for (const userObj of userObjects) {
        // Grabs the current reviewer's Letterboxd ID link
        var userLink = userObj.querySelector(".avatar").getAttribute("href");

        // Grabs the HTML element where the taste meter will be added
        var attributeObject = userObj.querySelector(".attribution");

        // If there is no taste meter span, generate one, otherwise ignore
        if (!attributeObject.querySelector(".taste-meter")) {
            // Get taste meter score
            var { tasteScore, sharedRatings } = await getTasteScore(userLink);

            // Add the taste meter score to the attribution HTML element
            const meterSpan = document.createElement("span");

            meterSpan.classList.add("taste-meter");
            
            

            if ((typeof tasteScore) == "number") {
                // meterSpan.style.border = "1px solid";
                // meterSpan.style.margin = "1px 5px 1px 5px";

                if (tasteScore <= 50){
                    meterSpan.style.color = "red";
                } else if (tasteScore <= 69){
                    meterSpan.style.color = "#f7a427";
                }else{
                    meterSpan.style.color = "#00ff40";
                }
                meterSpan.textContent = `Taste Meter: ${tasteScore}% from ${sharedRatings} movies`;
                // meterSpan.style.fontWeight = "bold";
                
            } else {
                meterSpan.style.fontWeight = "bold";
                meterSpan.textContent = `Only ${sharedRatings} shared movie ratings`;
            }
            attributeObject.appendChild(meterSpan);
        }

    }
}

chrome.runtime.onMessage.addListener(async (obj, sender, sendResponse) => {
    const { type } = obj;

    if (type === "movie") {

        // Wait until reviews load and then display taste meter
        setTimeout(displayTasteMeter, 500);

    }
    // Send the final response
    sendResponse({ status: "processed" });

    // Returning true to indicate that the response is asynchronous
    return true;
});




