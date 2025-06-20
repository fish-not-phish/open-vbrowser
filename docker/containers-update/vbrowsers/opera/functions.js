const uuid = "{{UUID}}";
const CUSTOM_DOMAIN="{{CUSTOM_DOMAIN}}";
const DEFAULT_IDLE_THRESHOLD="{{DEFAULT_IDLE_THRESHOLD}}";
const idleThreshold = parseInt(DEFAULT_IDLE_THRESHOLD);
console.log("User UUID:", uuid);

// Function to capture the canvas screenshot with a conditional diagonal watermark and send data to the parent
function captureScreenshot() {
  const container = document.getElementById('noVNC_container');
  if (!container) {
    console.error('noVNC_container not found.');
    return;
  }
  
  const canvas = container.querySelector('canvas');
  if (!canvas) {
    console.error('Canvas not found in noVNC_container.');
    return;
  }
  
  // Create an offscreen canvas with the same dimensions
  const watermarkCanvas = document.createElement('canvas');
  watermarkCanvas.width = canvas.width;
  watermarkCanvas.height = canvas.height;
  const ctx = watermarkCanvas.getContext('2d');
  
  // Draw the original canvas content onto the offscreen canvas
  ctx.drawImage(canvas, 0, 0);
  
  // Convert the offscreen canvas (with or without the watermark) to a PNG data URL
  const dataURL = watermarkCanvas.toDataURL('image/png');
  
  // Send the data URL to the parent window via postMessage
  window.parent.postMessage({ type: 'screenshot', dataURL: dataURL }, '*');
}

// Listen for a request from the parent page to capture a screenshot
window.addEventListener('message', function(event) {
  // Optionally, validate event.origin to ensure security.
  if (event.data && event.data.type === 'captureScreenshot') {
    captureScreenshot();
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('noVNC_container');
  if (!container) {
    console.error('noVNC_container not found.');
    return;
  }
  
  // Set the inactivity threshold
  let inactivityThresholdSeconds = parseInt(idleThreshold);
  
  // Variable to store the timer
  let inactivityTimer;
  
  // Function to send an API request when user is inactive
  function sendInactivityApiRequest() {
    console.log("User is inactive. Sending API request.");
    fetch(`https://${custom_domain}/close_session/${uuid}`, {  // Replace with your API endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inactive: true, timestamp: Date.now() })
    })
      .then(response => response.json())
      .then(data => console.log("API response:", data))
      .catch(error => console.error("Error with API request:", error));
  }
  
  // Function to reset the inactivity timer
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      sendInactivityApiRequest();
    }, inactivityThresholdSeconds * 1000);
  }
  
  // Poll for the canvas every 500ms until it is found
  const checkCanvas = setInterval(function() {
    const canvas = container.querySelector('canvas');
    if (canvas) {
      clearInterval(checkCanvas);
      // Make the canvas focusable to receive keyboard events
      if (!canvas.hasAttribute('tabindex')) {
        canvas.setAttribute('tabindex', '0');
      }
      // Focus the canvas on click
      canvas.addEventListener('click', function() {
        canvas.focus();
        resetInactivityTimer();
      });
      // Monitor mouse movements on the canvas and reset inactivity timer
      canvas.addEventListener('mousemove', function(event) {
        resetInactivityTimer();
      });
      // Monitor keyboard interactions on the canvas and reset inactivity timer
      canvas.addEventListener('keydown', function(event) {
        resetInactivityTimer();
      });
      // Start the inactivity timer once the canvas is found
      resetInactivityTimer();
    } 
  }, 500);
});
