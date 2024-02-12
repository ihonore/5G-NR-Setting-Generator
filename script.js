let latitude = '';
let longitude = '';
let binSizeInMeters = '';

let populationDensity = 0;
let city = "";

// Calculate bbox
function calculateBbox(latitude, longitude, binSizeInMeters) {
    const earthRadius = 6371000;

    const deltaLat = binSizeInMeters / earthRadius * (180 / Math.PI);
    const deltaLon = binSizeInMeters / (earthRadius * Math.cos(Math.PI * latitude / 180)) * (180 / Math.PI);

    const maxLat = latitude + deltaLat;
    const minLat = latitude - deltaLat;
    const maxLon = longitude + deltaLon;
    const minLon = longitude - deltaLon;

    return `${minLat},${minLon},${maxLat},${maxLon}`;
}

// Function to fetch data from Overpass API
async function fetchData(overpassQuery) {
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `data=${encodeURIComponent(overpassQuery)}`
        });
        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error('Error fetching data from Overpass API: ' + error);
    }
}

// Function to process building data and filter by height-related tags
function processBuildingData(data) {
    const buildingsWithHeightTags = data.elements.filter(element => {
        const tags = element.tags;
        return (
            'height' in tags ||
            'building:levels' in tags ||
            'building:levels:aboveground' in tags ||
            'building:levels:underground' in tags ||
            'building:height' in tags ||
            'building:min_height' in tags ||
            'building:min_level' in tags ||
            'building:max_level' in tags
        );
    });
    return buildingsWithHeightTags;
}

const computeAverage = (arr) => {
    const sum = arr.reduce((acc, cur) => acc + cur);
    const average = sum / arr.length;
    return average;
}

// Function to process maxspeed data and calculate maximum speed
function processMaxSpeedData(data) {
    const maxspeeds = data.elements.map(element => {
        return parseInt(element.tags.maxspeed) || null; // Extract maxspeed values and convert to integers
    });

    const validMaxspeeds = maxspeeds.filter(speed => speed !== null);
    const maxSpeedInArea = Math.max(...validMaxspeeds);
    const minSpeedInArea = Math.min(...validMaxspeeds);
    const meanSpeed = computeAverage(validMaxspeeds);
    return {
        maxSpeed: maxSpeedInArea,
        minSpeed: minSpeedInArea,
        meanSpeed: meanSpeed
    };
}

// Function to calculate metrics based on building height data
function calculateBuildingMetrics(buildingsData) {
    // Initialize variables to store metrics
    let tallestBuildingsCount = 0;
    let totalHeight = 0;
    let totalLevels = 0;
    let buildingsWithHeightOrLevels = 0;
    let maxBuildingHeight = -Infinity;
    let maxLevels = -Infinity;
    let buildingWithMaxHeight = null;
    let buildingWithMaxLevels = null;

    // Iterate over buildings data to calculate metrics
    buildingsData.forEach(building => {
        const height = parseFloat(building.tags.height) || 0; // Extract height (convert to float)
        const levels = parseInt(building.tags['building:levels']) || 0; // Extract number of levels (convert to integer)

        // Update metrics
        if (height > 0 || levels > 0) {
            buildingsWithHeightOrLevels++;
            if (height > maxBuildingHeight) {
                maxBuildingHeight = height;
                buildingWithMaxHeight = building;
            }
            if (levels > maxLevels) {
                maxLevels = levels;
                buildingWithMaxLevels = building;
            }
            if (height > tallestBuildingsCount) {
                tallestBuildingsCount++;
            }
            totalHeight += height;
            totalLevels += levels;
        }
    });

    // Calculate average height and average number of levels
    const averageHeight = buildingsWithHeightOrLevels > 0 ? totalHeight / buildingsWithHeightOrLevels : 0;
    const averageLevels = buildingsWithHeightOrLevels > 0 ? totalLevels / buildingsWithHeightOrLevels : 0;

    // Return metrics and buildings with max height and levels
    return {
        tallestBuildingsCount,
        averageHeight,
        averageLevels,
        buildingWithMaxHeight,
        buildingWithMaxLevels
    };
}

// Main function to orchestrate fetching and processing of data
async function main(latitude,longitude,binSizeInMeters) {
    try {

        const bbox = calculateBbox(latitude, longitude, binSizeInMeters);
        const overpassQueryMaxSpeed = `
    [out:json];
    way(${bbox})[highway][maxspeed];
    out;
    `;
    
        const overpassQueryBuildings = `
        [out:json];
        way(${bbox})[building];
        out;
    `;

        const buildingsData = await fetchData(overpassQueryBuildings);
        const maxSpeedData = await fetchData(overpassQueryMaxSpeed);

        const buildingsWithHeightTags = processBuildingData(buildingsData);
        console.log('Buildings with potentially useful height-related tags:', buildingsWithHeightTags);

        const maxSpeedInArea = processMaxSpeedData(maxSpeedData);
        let { maxSpeed, minSpeed, meanSpeed } = maxSpeedInArea;

        meanSpeed = Math.ceil(meanSpeed);
        console.log('Maximum speed in the given area:', maxSpeed);
        console.log('Minimum speed in the given area:', minSpeed);
        console.log('Average speed in the given area:', meanSpeed);

        // Calculate building metrics
        const buildingMetrics = calculateBuildingMetrics(buildingsData.elements);

        let { averageHeight, averageLevels, buildingWithMaxHeight, buildingWithMaxLevels } = buildingMetrics;
        console.log(averageHeight,averageLevels,buildingWithMaxHeight,buildingWithMaxLevels)
        let maximumHeight = buildingWithMaxHeight?.tags.height;
        let maxHeightName = buildingWithMaxHeight?.tags.name || "Name not available";
        let maxLevelsName = buildingWithMaxLevels?.tags.name || "Name not available";
        let maximumLevels = buildingWithMaxLevels.tags['building:levels'];

        averageHeight = Math.ceil(averageHeight);
        averageLevels = Math.ceil(averageLevels);
        console.log('Number of Tallest Buildings:', buildingMetrics.tallestBuildingsCount);
        console.log('Average Building Height:', averageHeight);
        console.log('Average Number of Levels:', averageLevels);
        console.log('MaxHeight:', buildingMetrics.buildingWithMaxHeight);
        console.log('Max Number of Levels:', buildingMetrics.buildingWithMaxLevels);

        const { subCarrier, frequency, cyclicMode } = select5GNRSettings(populationDensity, averageHeight, averageLevels, meanSpeed);
        console.log(subCarrier, frequency, cyclicMode)

        displayRecommendation(minSpeed, maxSpeed, meanSpeed, maximumHeight, maximumLevels, city, populationDensity, averageHeight, averageLevels, subCarrier, frequency, cyclicMode,maxHeightName,maxLevelsName);
    } catch (error) {
        console.error(error);
    }
}

// Decision logic for selecting 5G NR settings
function select5GNRSettings(populationDensity, averageHeight, averageLevels, averageSpeed) {
    let subCarrier = '';
    let frequency = '';
    let cyclicMode = '';

    // Determine sub-carrier width based on average speed
    if (averageSpeed > 70) {
        subCarrier = '120 kHz';
    } else if (averageSpeed > 50) {
        subCarrier = '60 kHz';
    } else if (averageSpeed > 30) {
        subCarrier = '30 kHz';
    } else {
        subCarrier = '15 kHz';
    }

    // Determine frequency band based on population density
    if (populationDensity > 1000) {
        frequency = '3.5 GHz';
    } else if (populationDensity > 500) {
        frequency = '2.4 GHz';
    } else {
        frequency = '700 MGz';
    }

    // Determine cyclic mode based on average building height and levels
    if (averageHeight > 20 || averageLevels > 7) {
        cyclicMode = 'Extended';
    } else {
        cyclicMode = 'Normal';
    }

    return {
        subCarrier,
        frequency,
        cyclicMode
    };
}

const spin=document.querySelector('.spin-wrap');

//Handle Event
document.getElementById('coordinatesForm').addEventListener('submit', function (event) {
    event.preventDefault();
    spin.classList.toggle('hide');
    latitude = parseFloat(document.getElementById('latitude').value);
    longitude = parseFloat(document.getElementById('longitude').value);
    binSizeInMeters = parseInt(document.getElementById('binsize').value);


    /// Make a request to the OpenStreetMap Nominatim API for reverse geocoding
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
        .then(response => response.json())
        .then(data => {
            const address = data.address;
            city = address.city || address.town || address.village || address.hamlet;
            console.log("Nearest city: ", city)

            // Request to the API I set up to parse the excel data
            return fetch(`https://population-density-honore.onrender.com/population-density?city=${city}&year=2020`);
        })
        .then(response => response.json())
        .then(populationDensityData => {
            populationDensity = populationDensityData.populationDensity;
            console.log('Population density:', populationDensity);
            main(latitude,longitude,binSizeInMeters);
        })
        .catch(error => {
            console.error('Error:', error);
        });


});

function displayRecommendation(minSpeed, maxSpeed, meanSpeed, maximumHeight, maximumLevels, city, populationDensity, averageHeight, averageLevels, subCarrier, frequency, cyclicMode,maxHeightName,maxLevelsName) {
    const recommendationDiv = document.querySelector('.recommendedSettings');
    spin.classList.toggle('hide');

    recommendationDiv.innerHTML = `
    <p style="text-align: center; font-weight: 600;" class="city-population">City: <span
                class="city">${city} </span>with Population Density: <span class="p-density">${populationDensity}</span> per
            km<sup>2</sup></p>
        <div id="recommendation">
            <div>
                <p><strong>Frequency:</strong> ${frequency}</p>
                <p><strong>Subcarrier:</strong> ${subCarrier}</p>
                <p><strong>Cyclic Mode:</strong> ${cyclicMode}</p>
            </div>
        </div>
        <h2 style="font-size: 20px; color: white;">Detailed location information</h2>
        <div class="additional-info">
            <div class="left">
                <h4>BUILDINGS</h3>
                    <p>Average Height : <span>${averageHeight} m</span> </p>
                    <p>Average Levels : <span>${averageLevels}</span> </p>
                    <p>Building with Max Height : <span>${maximumHeight} m</span> </p>
                    <p>Building with Max Levels : <span>${maximumLevels} Floors</span> </p>
            </div>
            <div class="right">
                <h4>SPEED</h4>
                <p>Min Speed : <span>${minSpeed} kmh</span> </p>
                <p>Max Speed : <span>${maxSpeed} kmh</span> </p>
                <p>Average Speed : <span>${meanSpeed} kmh</span> </p>
            </div>
    
        </div>
        <div class="buildings-info post-it">
            <div>Building with Max Height is:</dv>
                <p>${maxHeightName}</p>
                <div>Building with Max Levels is:</dv>
                    <p>${maxLevelsName}</p>
        </div>
    `;
}
