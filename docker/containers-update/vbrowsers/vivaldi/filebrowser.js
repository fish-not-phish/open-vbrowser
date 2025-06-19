// Define the allowed base directory
const allowedBaseDir = '/config/Downloads';

// Set up the socket connection
var host = window.location.hostname; 
var port = window.location.port;
var protocol = window.location.protocol;
var path = window.location.pathname;
var socket = io(protocol + '//' + host + ':' + port, { path: path + '/socket.io' });

// Open the default folder on connect (restricted to allowedBaseDir)
socket.on('connect', function(){
  $('#filebrowser').empty();
  $('#filebrowser').append($('<div>').attr('id','loading'));
  socket.emit('open', allowedBaseDir);
});

// Get file list with validation to ensure directory is within allowedBaseDir
function getFiles(directory) {
  // Clean up the directory string
  directory = directory.replace("//", "/").replace("|", "'");
  
  // Verify that the directory is within allowedBaseDir
  if (!directory.startsWith(allowedBaseDir)) {
    alert('Access Denied: You cannot access this directory.');
    return;
  }
  
  // Remove trailing slash if not root (optional)
  if ((directory !== '/') && (directory.endsWith('/'))) {
    directory = directory.slice(0, -1);
  }
  
  $('#filebrowser').empty();
  $('#filebrowser').append($('<div>').attr('id','loading'));
  socket.emit('getfiles', directory);
}

// Render file list while restricting navigation above allowedBaseDir
async function renderFiles(data) {
  let dirs = data[0];
  let files = data[1];
  let directory = data[2];

  // Determine if the parent link should be displayed.
  // Only allow "go up" if the current directory is deeper than allowedBaseDir.
  let showParent = directory !== allowedBaseDir;
  
  let table = $('<table>').addClass('fileTable');
  let tableHeader = $('<tr>');
  for (let header of ['Name', 'Type', 'Delete (NO WARNING)']) {
    tableHeader.append($('<th>').text(header));
  }
  table.append(tableHeader);

  // Conditionally add the parent directory row if allowed
  if (showParent) {
    // Calculate parent directory from current directory
    let parentFolder = directory.substring(0, directory.lastIndexOf('/'));
    // Ensure the parent directory does not go above allowedBaseDir
    if (parentFolder.startsWith(allowedBaseDir)) {
      let parentLink = $('<td>')
        .addClass('directory')
        .attr('onclick', 'getFiles(\'' + parentFolder + '\');')
        .text('..');
      let parentRow = $('<tr>');
      for (let item of [parentLink, $('<td>').text('Parent'), $('<td>')]) {
        parentRow.append(item);
      }
      table.append(parentRow);
    }
  }
  
  // Update the UI with the current directory and table of files/folders
  $('#filebrowser').empty();
  $('#filebrowser').data('directory', directory);
  $('#filebrowser').append($('<div>').text(directory));
  $('#filebrowser').append(table);

  // List directories
  if (dirs.length > 0) {
    for (let dir of dirs) {
      let tableRow = $('<tr>');
      let dirClean = dir.replace("'", "|");
      // Construct the new directory path
      let newDir = directory + '/' + dirClean;
      let link = $('<td>')
        .addClass('directory')
        .attr('onclick', 'getFiles(\'' + newDir + '\');')
        .text(dir);
      let type = $('<td>').text('Dir');
      let del = $('<td>').append(
        $('<button>')
          .addClass('deleteButton')
          .attr('onclick', 'deleter(\'' + newDir + '\');')
          .text('Delete')
      );
      tableRow.append(link, type, del);
      table.append(tableRow);
    }
  }
  
  // List files
  if (files.length > 0) {
    for (let file of files) {
      let tableRow = $('<tr>');
      let fileClean = file.replace("'", "|");
      let filePath = directory + '/' + fileClean;
      let link = $('<td>')
        .addClass('file')
        .attr('onclick', 'downloadFile(\'' + filePath + '\');')
        .text(file);
      let type = $('<td>').text('File');
      let del = $('<td>').append(
        $('<button>')
          .addClass('deleteButton')
          .attr('onclick', 'deleter(\'' + filePath + '\');')
          .text('Delete')
      );
      tableRow.append(link, type, del);
      table.append(tableRow);
    }
  }
}

// Download a file (only if it's within allowedBaseDir)
function downloadFile(file) {
  file = file.replace("|", "'");
  // Ensure the file is within the allowed directory
  if (!file.startsWith(allowedBaseDir)) {
    alert('Access Denied: You cannot download this file.');
    return;
  }
  socket.emit('downloadfile', file);
}

// Send file data for downloading
function sendFile(res) {
  let data = res[0];
  let fileName = res[1];

  // Create a new instance of JSZip and add the file
  var zip = new JSZip();
  zip.file(fileName, data);

  // Generate the ZIP archive as a Blob
  zip.generateAsync({ type: "blob" }).then(function(content) {
    let url = window.URL || window.webkitURL;
    let link = $("<a />");
    link.attr("download", fileName + ".zip");
    link.attr("href", url.createObjectURL(content));
    $("body").append(link);
    link[0].click();
    $("body").remove(link);
  }).catch(function(error) {
    console.error("Error generating zip file:", error);
  });
}

// Upload files to the current directory (only if within allowedBaseDir)
async function upload(input) {
  let directory = $('#filebrowser').data('directory');
  // Ensure upload destination is within allowedBaseDir
  if (!directory.startsWith(allowedBaseDir)) {
    alert('Access Denied: You cannot upload to this directory.');
    return;
  }
  let directoryUp = (directory === '/') ? '' : directory;
  if (input.files && input.files[0]) {
    $('#filebrowser').empty();
    $('#filebrowser').append($('<div>').attr('id','loading'));
    for (let file of input.files) {
      let reader = new FileReader();
      reader.onload = async function(e) {
        let fileName = file.name;
        if (e.total < 200000000) {
          let data = e.target.result;
          $('#filebrowser').append($('<div>').text('Uploading ' + fileName));
          if (file === input.files[input.files.length - 1]) {
            socket.emit('uploadfile', [directory, directoryUp + '/' + fileName, data, true]);
          } else {
            socket.emit('uploadfile', [directory, directoryUp + '/' + fileName, data, false]);
          }
        } else {
          $('#filebrowser').append($('<div>').text('File too big ' + fileName));
          await new Promise(resolve => setTimeout(resolve, 2000));
          socket.emit('getfiles', directory);
        }
      }
      reader.readAsArrayBuffer(file);
    }
  }
}

// Delete file/folder with directory check (client-side, but must be enforced server-side as well)
function deleter(item) {
  let directory = $('#filebrowser').data('directory');
  // Verify that the item to delete is within allowedBaseDir
  if (!item.startsWith(allowedBaseDir)) {
    alert('Access Denied: You cannot delete this directory or file.');
    return;
  }
  $('#filebrowser').empty();
  $('#filebrowser').append($('<div>').attr('id','loading'));
  socket.emit('deletefiles', [item, directory]);
}

// Create a new folder within the current directory
function createFolder() {
  let directory = $('#filebrowser').data('directory');
  let directoryUp = (directory === '/') ? '' : directory;
  let folderName = $('#folderName').val();
  $('#folderName').val('');
  if ((folderName.length === 0) || (folderName.includes('/'))) {
    alert('Bad or Null Directory Name');
    return '';
  }
  $('#filebrowser').empty();
  $('#filebrowser').append($('<div>').attr('id','loading'));
  let newFolder = directoryUp + '/' + folderName;
  // Ensure new folder is within allowedBaseDir
  if (!newFolder.startsWith(allowedBaseDir)) {
    alert('Access Denied: Cannot create folder outside of allowed directory.');
    return;
  }
  socket.emit('createfolder', [newFolder, directory]);
}

// Handle drag and drop file upload
async function dropFiles(ev) {
  ev.preventDefault();
  $('#filebrowser').empty();
  $('#filebrowser').append($('<div>').attr('id','loading'));
  $('#dropzone').css({'visibility':'hidden','opacity':0});
  let directory = $('#filebrowser').data('directory');
  // Ensure drop destination is within allowedBaseDir
  if (!directory.startsWith(allowedBaseDir)) {
    alert('Access Denied: You cannot upload to this directory.');
    return;
  }
  let directoryUp = (directory === '/') ? '' : directory;
  let items = await getAllFileEntries(ev.dataTransfer.items);
  for (let item of items) {
    let fullPath = item.fullPath;
    // Construct full path ensuring it remains under allowedBaseDir
    let targetPath = directoryUp + '/' + fullPath;
    if (!targetPath.startsWith(allowedBaseDir)) {
      alert('Access Denied: One or more files are outside the allowed directory.');
      continue;
    }
    item.file(async function(file) {
      let reader = new FileReader();
      reader.onload = async function(e) {
        let fileName = file.name;
        if (e.total < 200000000) {
          let data = e.target.result;
          $('#filebrowser').append($('<div>').text('Uploading ' + fileName));
          if (item === items[items.length - 1]) {
            socket.emit('uploadfile', [directory, targetPath, data, true]);
          } else {
            socket.emit('uploadfile', [directory, targetPath, data, false]);
          }
        } else {
          $('#filebrowser').append($('<div>').text('File too big ' + fileName));
          await new Promise(resolve => setTimeout(resolve, 2000));
          socket.emit('getfiles', directory);
        }
      }
      reader.readAsArrayBuffer(file);
    });
  }
}

// Utility function to retrieve all file entries from the drop event
async function getAllFileEntries(dataTransferItemList) {
  let fileEntries = [];
  let queue = [];
  for (let i = 0; i < dataTransferItemList.length; i++) {
    queue.push(dataTransferItemList[i].webkitGetAsEntry());
  }
  while (queue.length > 0) {
    let entry = queue.shift();
    if (entry.isFile) {
      fileEntries.push(entry);
    } else if (entry.isDirectory) {
      let reader = entry.createReader();
      queue.push(...await readAllDirectoryEntries(reader));
    }
  }
  return fileEntries;
}

// Read all entries in a directory
async function readAllDirectoryEntries(directoryReader) {
  let entries = [];
  let readEntries = await readEntriesPromise(directoryReader);
  while (readEntries.length > 0) {
    entries.push(...readEntries);
    readEntries = await readEntriesPromise(directoryReader);
  }
  return entries;
}

// Wrap readEntries in a promise
async function readEntriesPromise(directoryReader) {
  try {
    return await new Promise((resolve, reject) => {
      directoryReader.readEntries(resolve, reject);
    });
  } catch (err) {
    console.log(err);
  }
}

// Handle dragenter event to display drop zone
var lastTarget;
window.addEventListener('dragenter', function(ev) {
  lastTarget = ev.target;
  $('#dropzone').css({'visibility':'', 'opacity':1});
});

// Hide drop zone when dragging leaves
window.addEventListener("dragleave", function(ev) {
  if(ev.target == lastTarget || ev.target == document) {
    $('#dropzone').css({'visibility':'hidden', 'opacity':0});
  }
});

// Prevent default behavior for dragover
function allowDrop(ev) {
  ev.preventDefault();
}

// Socket event listeners
socket.on('renderfiles', renderFiles);
socket.on('sendfile', sendFile);

// Automatically refresh the file list every 10 seconds
setInterval(function() {
  let currentDirectory = $('#filebrowser').data('directory') || allowedBaseDir;
  socket.emit('getfiles', currentDirectory);
}, 10000);