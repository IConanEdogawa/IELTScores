const ctx = document.getElementById('ieltsChart').getContext('2d');
if (!ctx) {
    console.error("Canvas element not found!");
}
let testData = [];

let ieltsChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Reading', 'Speaking', 'Writing', 'Listening', 'Overall'],
        datasets: []
    },
    options: {
        responsive: true,
        plugins: {
            legend: {
                display: true,
                position: 'top'
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 9
            }
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                let datasetIndex = elements[0].datasetIndex;
                showRemoveOptions(datasetIndex);
            }
        }
    }
});


function validateInput(input) {
    let value = parseFloat(input.value);

    if (isNaN(value) || value < 0 || value > 9 || value % 0.5 !== 0) {
        input.value = ""; // Очищаем поле
        showErrorMessage(input, "Score must be between 0 and 9 with a step of 0.5");
    } else {
        hideErrorMessage(input);
    }
}

function showErrorMessage(input, message) {
    let errorSpan = input.nextElementSibling;
    if (!errorSpan || !errorSpan.classList.contains("error-message")) {
        errorSpan = document.createElement("span");
        errorSpan.classList.add("error-message");
        errorSpan.style.color = "red";
        errorSpan.style.fontSize = "14px";
        errorSpan.style.display = "block";
        errorSpan.style.marginTop = "5px";
        input.parentNode.appendChild(errorSpan);
    }
    errorSpan.textContent = message;
}

function hideErrorMessage(input) {
    let errorSpan = input.nextElementSibling;
    if (errorSpan && errorSpan.classList.contains("error-message")) {
        errorSpan.remove();
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const input = document.getElementById("numberInput");
    if (input) {
        input.addEventListener("blur", function () {
            validateInput(input);
        });
    } else {
        console.error("numberInput не найден!");
    }
});



function addTestData() {
    let date = document.getElementById('testDate').value || `Test #${testData.length + 1}`;
    let reading = parseFloat(document.getElementById('reading').value) || 0;
    let speaking = parseFloat(document.getElementById('speaking').value) || 0;
    let writing = parseFloat(document.getElementById('writing').value) || 0;
    let listening = parseFloat(document.getElementById('listening').value) || 0;
    let overall = ((reading + speaking + writing + listening) / 4).toFixed(1);
    let color = `hsl(${Math.random() * 360}, 70%, 50%)`;

    let dataset = {
        label: date,
        data: [reading, speaking, writing, listening, overall],
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        fill: false,
        tension: 0.2
    };

    testData.push(dataset);
    ieltsChart.data.datasets.push(dataset);
    ieltsChart.update();
}

function showRemoveOptions(datasetIndex) {
    let selectedTest = ieltsChart.data.datasets[datasetIndex];

    let testSelector = document.getElementById("testSelector");
    testSelector.innerHTML = "";
    testData.forEach((test, index) => {
        if (JSON.stringify(test.data) === JSON.stringify(selectedTest.data)) {
            let option = document.createElement("option");
            option.value = index;
            option.textContent = test.label;
            testSelector.appendChild(option);
        }
    });

    document.getElementById("testInfo").textContent = selectedTest.label;
    document.getElementById("colorBox").style.backgroundColor = selectedTest.borderColor;
    document.getElementById("removeSection").style.display = "flex";
}

function removeSelectedTest() {
    let index = document.getElementById("testSelector").value;
    ieltsChart.data.datasets.splice(index, 1);
    testData.splice(index, 1);
    ieltsChart.update();
    document.getElementById("removeSection").style.display = "none";
}


function openSupportPage() {
    window.open("https://t.me/umarhon3005", "_blank");
}

function openAboutPage() {
    window.location.href = "aboutus.html";
}

