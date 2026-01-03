const tier = "OSS";
const uuid = "{{UUID}}";
const CUSTOM_DOMAIN="{{CUSTOM_DOMAIN}}";
const DEFAULT_IDLE_THRESHOLD="{{DEFAULT_IDLE_THRESHOLD}}";

// =====================
// DOM customizations
// =====================
window.addEventListener('load', function () {

  // Sections hidden by tier
  const SECTIONS_FREE_HIDE = [
    'sharing-content',
    'gamepads-content',
    'apps-content',
    'files-content', // files hidden for FREE
  ];
  const SECTIONS_PREMIUM_HIDE = [
    'sharing-content',
    'gamepads-content',
    'apps-content',
  ];

  function hideSections(root = document) {
    const targets = tier.toLowerCase() === 'oss' ? SECTIONS_PREMIUM_HIDE : SECTIONS_FREE_HIDE;
    targets.forEach(id => {
      const header = root.querySelector(`.sidebar-section-header[aria-controls="${id}"]`);
      if (!header) return;
      const section = header.closest('.sidebar-section');
      if (section && section.style.display !== 'none') {
        section.style.display = 'none';
        // console.log(`Hid section: ${id}`);
      }
    });
  }

  // Always replace the Gamepad Input button (Enable/Disable) with a "Screenshot" button
  function replaceGamepadButtonWithScreenshot(root = document) {
    // Handle both states and be robust to future title text
    const btn =
      root.querySelector('.sidebar-action-buttons button[title="Enable Gamepad Input"]') ||
      root.querySelector('.sidebar-action-buttons button[title="Disable Gamepad Input"]') ||
      root.querySelector('.sidebar-action-buttons button[title*="Gamepad"]');

    if (!btn) return;

    // If it's already a Screenshot button, skip
    if (btn.title === 'Screenshot' || btn.getAttribute('data-replaced-by') === 'screenshot') return;

    const screenshotBtn = document.createElement('button');
    screenshotBtn.className = 'action-button';
    screenshotBtn.title = 'Screenshot';
    screenshotBtn.setAttribute('data-replaced-by', 'screenshot');
    screenshotBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
        <path d="M21 5h-3.2l-1.8-2H8L6.2 5H3a2 2 0 0 0-2 2v12a2 
                 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7a2 2 0 
                 0 0-2-2zm-9 14a5 5 0 1 1 0-10 5 
                 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 
                 6 3 3 0 0 0 0-6z"></path>
      </svg>
    `;

    screenshotBtn.addEventListener('click', () => {
      console.log('Screenshot button clicked!');
      try {
        captureScreenshot();
      } catch (e) {
        console.error('captureScreenshot() not available:', e);
      }
    });

    btn.replaceWith(screenshotBtn);
    // console.log('Replaced Gamepad Input with Screenshot');
  }

  function applyAll(root = document) {
    hideSections(root);
    replaceGamepadButtonWithScreenshot(root);
  }

  // Apply now
  applyAll();

  // Observe for dynamic DOM changes (SPA/late mounts)
  const rootNode = document.getElementById('dashboard-root') || document.body;
  const observer = new MutationObserver(() => applyAll(rootNode));
  observer.observe(rootNode, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['title', 'class', 'aria-controls']
  });
});


// Function to capture the canvas screenshot with a conditional diagonal watermark and send data to the parent
function captureScreenshot() {  
  const canvas = document.getElementById('videoCanvas');
  if (!canvas) {
    console.error('Canvas not found in video-container.');
    return;
  }
  
  // Create an offscreen canvas with the same dimensions
  const watermarkCanvas = document.createElement('canvas');
  watermarkCanvas.width = canvas.width;
  watermarkCanvas.height = canvas.height;
  const ctx = watermarkCanvas.getContext('2d');
  
  // Draw the original canvas content onto the offscreen canvas
  ctx.drawImage(canvas, 0, 0);
  
  // Only add watermark if the user tier is "free"
  if (tier.toLowerCase() === "oss") {
    const watermarkText = "vBrowser";
    const fontSize = Math.min(watermarkCanvas.width, watermarkCanvas.height) / 5;
    ctx.font = fontSize + "px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; // Semi-transparent white
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Save context state and translate to the center of the canvas
    ctx.save();
    ctx.translate(watermarkCanvas.width / 2, watermarkCanvas.height / 2);
    
    // Calculate the angle that aligns with the canvas diagonal.
    const angle = Math.atan(watermarkCanvas.height / watermarkCanvas.width);
    ctx.rotate(-angle);
    
    // Draw the watermark text at the center
    ctx.fillText(watermarkText, 0, 0);
    
    // Restore the original context state
    ctx.restore();
  }
  
  // Convert the offscreen canvas (with or without the watermark) to a PNG data URL
  const dataURL = watermarkCanvas.toDataURL('image/png');
  
  // Send the data URL to the parent window via postMessage
  // window.parent.postMessage({ type: 'screenshot', dataURL: dataURL }, '*');
  // Trigger download directly
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'screenshot.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Listen for a request from the parent page to capture a screenshot
window.addEventListener('message', function(event) {
  // Optionally, validate event.origin to ensure security.
  if (event.data && event.data.type === 'captureScreenshot') {
    captureScreenshot();
  }
});

window.addEventListener('load', function () {
  const container = document.querySelector('.video-container');
  if (!container) {
    console.error('video-container not found.');
    return;
  }

  const input = document.getElementById('overlayInput');
  if (!input) {
    console.error('overlayInput not found.');
    return;
  }
  
  // Set the inactivity threshold based on the user tier
  let inactivityThresholdSeconds;
  if (DEFAULT_IDLE_THRESHOLD) {
    inactivityThresholdSeconds = DEFAULT_IDLE_THRESHOLD;
  }
  
  // Variable to store the timer
  let inactivityTimer;
  
  // Function to send an API request when user is inactive
  function sendInactivityApiRequest() {
    console.log("User is inactive. Sending API request.");
    fetch(`https://${CUSTOM_DOMAIN}/close_session/${uuid}`, { 
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
    if (input) {
      input.focus();
      clearInterval(checkCanvas);

      // Focus the canvas on click
      input.addEventListener('click', function() {
        console.log("Mouse movement detected on input.");
        input.focus();
        resetInactivityTimer();
      });
      // Monitor mouse movements on the canvas and reset inactivity timer
      input.addEventListener('mousemove', function(event) {
        console.log("Mouse movement detected on input.");
        resetInactivityTimer();
      });
      // Monitor keyboard interactions on the canvas and reset inactivity timer
      document.addEventListener('keydown', function(event) {
          console.log("Keydown detected anywhere on page.");
          resetInactivityTimer();
      });
      input.addEventListener('keydown', function(event) {
        console.log("Keydown detected on input.");
        resetInactivityTimer();
      });
      // Start the inactivity timer once the canvas is found
      resetInactivityTimer();
    } 
  }, 500);
});

