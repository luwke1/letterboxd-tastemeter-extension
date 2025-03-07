// Returns the taste score for a specific user
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

// Fetches user reviews sorted by extension users lowest ratings
async function fetchUserReviews(userLink) {
    const response = await fetch(`https://letterboxd.com${userLink}films/by/your-rating-lowest/`, { credentials: "include" });
    if (!response.ok) {
        throw new Error(`Failed to fetch reviews for ${userLink}: ${response.statusText}`);
    }
    const text = await response.text();

    // Parse the HTML response into a DOM object
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(text, "text/html");

    // Select all user reviews sorted by lowest rating
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
            reviewData[filmID] = userRating;
        }
    });

    return reviewData;
}

// Fetches extension user reviews based on the other user's review data
async function fetchExtensionUserRatings(reviewData, userLink) {
    const url = "https://letterboxd.com/ajax/letterboxd-metadata/";
    const headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://letterboxd.com",
        "Referer": `https://letterboxd.com${userLink}films/by/your-rating-lowest/`,
        "X-Requested-With": "XMLHttpRequest"
    };

    // Create URLSearchParams for the POST request
    const params = new URLSearchParams();
    const posterIds = Object.keys(reviewData);

    if (!posterIds.length) {
        console.warn("No poster IDs found in reviewData.");
        throw new Error("No poster IDs available to fetch admin user reviews.");
    }

    // Append film IDs and likeable film IDs to the params
    posterIds.forEach(id => {
        params.append('posters', id);
        params.append('likeables', `film:${id}`);
    });

    // Fetch extension user's reviews data using the POST request
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

    // Extract rateables and format them as expected by calculateTasteScore
    const adminUserReviews = {};
    jsonData.rateables.forEach(item => {
        const filmID = item.rateableUid.split(":")[1];
        adminUserReviews[filmID] = item.rating;
    });
    
    return adminUserReviews;
}

// Calculate the Pearson Correlation Coefficient and return the taste score
function calculateTasteScore(reviewData, adminUserReviews) {
    let sharedFilms = [];

    // Map adminUserReviews keys to film IDs without 'film:'
    let adminRatings = {};
    for (const filmID in adminUserReviews) {
        let rating = adminUserReviews[filmID];
        let starRating = rating / 20; // Convert to 0.5 to 5.0 scale
        adminRatings[filmID] = starRating;
    }

    // Convert user's ratings as well
    let userRatings = {};
    for (const filmID in reviewData) {
        let rating = reviewData[filmID];
        let starRating = rating / 20; // Convert to 0.5 to 5.0 scale
        userRatings[filmID] = starRating;
    }

    // Find shared films
    for (const filmID in userRatings) {
        if (adminRatings.hasOwnProperty(filmID)) {
            sharedFilms.push(filmID);
        }
    }

    let n = sharedFilms.length;

    if (n >= 15) {
        let sumX = 0;
        let sumY = 0;
        let sumX2 = 0;
        let sumY2 = 0;
        let sumXY = 0;

        for (const filmID of sharedFilms) {
            let x = userRatings[filmID];
            let y = adminRatings[filmID];
            sumX += x;
            sumY += y;
            sumX2 += x * x;
            sumY2 += y * y;
            sumXY += x * y;
        }

        let numerator = (n * sumXY) - (sumX * sumY);
        let denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

        if (denominator === 0) {
            return { tasteScore: 50, sharedRatings: n }; // Neutral similarity
        }

        let pearsonCorrelation = numerator / denominator;

        // Map pearsonCorrelation from [-1,1] to [0,100%]
        let similarityScore = Math.pow((pearsonCorrelation + 1) / 2, 0.5) * 100;

        return { tasteScore: Math.floor(similarityScore), sharedRatings: n };
    } else {
        return { tasteScore: "NOT ENOUGH INFO", sharedRatings: n };
    }
}

// Updated: Process each user individually so the taste meter appears as soon as the data is ready
async function displayTasteMeter() {
    const userObjects = document.querySelectorAll(".film-detail");

    userObjects.forEach(async (userObj) => {
        // Grab the reviewer's Letterboxd ID link
        const userLink = userObj.querySelector("a.avatar").getAttribute("href");
        const attributeObj = userObj.querySelector(".attribution");

        // Skip if taste meter already exists
        if (attributeObj.querySelector(".taste-meter")) return;

        try {
            const { tasteScore, sharedRatings } = await getTasteScore(userLink);
            const meterSpan = createMeterSpan(tasteScore, sharedRatings);
            attributeObj.appendChild(meterSpan);
        } catch (error) {
            console.error(`Error fetching taste meter for ${userLink}:`, error);
        }
    });
}

// Generates the display element for the similarity scores
function createMeterSpan(tasteScore, sharedRatings) {
    const meterSpan = document.createElement("span");
    meterSpan.classList.add("taste-meter");
    
    if (typeof tasteScore === "number") {
        if (tasteScore <= 50){
            meterSpan.style.color = "red";
        } else if (tasteScore <= 79){
            meterSpan.style.color = "#f7a427";
        } else {
            meterSpan.style.color = "#00ff40";
        }
        meterSpan.textContent = `Taste Meter: ${tasteScore}% from ${sharedRatings} movies`;
    } else {
        meterSpan.style.fontWeight = "bold";
        meterSpan.textContent = `Only ${sharedRatings} shared movie ratings`;
    }

    return meterSpan;
}

// Generate and display a similarity score for a profile page
async function displayProfileMeter(){
    const profileActions = document.querySelector('.profile-actions');
    const username = document.querySelector(".displayname").getAttribute("data-original-title");
    var { tasteScore, sharedRatings } = await getTasteScore(`/${username}/`);
    const meterSpan = createMeterSpan(tasteScore, sharedRatings);
    profileActions.append(meterSpan);
}

chrome.runtime.onMessage.addListener(async (obj, sender, sendResponse) => {
    const { type } = obj;

    if (type === "movie") {
        // Wait briefly to allow reviews to load then display taste meters individually
        setTimeout(displayTasteMeter, 500);
    } else if (type === "profile") {
        setTimeout(displayProfileMeter, 500);
    }

    sendResponse({ status: "processed" });
    return true;
});