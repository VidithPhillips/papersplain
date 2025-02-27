// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { githubConfig } from './config.production.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Add these variables at the top level of your script
let currentPDF = null;
let currentPage = 1;
let pageCount = 0;

console.log('Loading main.js');
try {
    console.log('Config loaded successfully');
} catch (error) {
    console.error('Error loading config:', error);
}

document.addEventListener('DOMContentLoaded', function() {
    // File upload handling
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#007bff';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ccc';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        handleFileUpload(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        handleFileUpload(e.target.files[0]);
    });

    async function handleFileUpload(file) {
        if (file && file.type === 'application/pdf') {
            if (file.size > 25 * 1024 * 1024) { // 25MB limit for GitHub Issues
                alert('File too large. Please upload PDFs under 25MB.');
                return;
            }
            try {
                // Show loading indicator
                const loadingDiv = document.createElement('div');
                loadingDiv.innerHTML = '<div class="alert alert-info">Uploading paper...</div>';
                document.getElementById('upload-section').appendChild(loadingDiv);

                // Get additional metadata from user
                const paperTitle = prompt('Enter paper title:', file.name.replace('.pdf', ''));
                const authors = prompt('Enter authors (comma separated):', '');
                const abstract = prompt('Enter abstract (optional):', '');

                // Upload to GitHub Issues
                const formData = new FormData();
                formData.append('file', file);
                
                const response = await fetch(`https://api.github.com/repos/${githubConfig.repo}/issues`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        title: `PDF Upload: ${paperTitle}`,
                        body: `Automated PDF upload via PapersPlain\n\nFile: ${file.name}`
                    })
                });

                const issueData = await response.json();
                const pdfUrl = issueData.body.match(/https:\/\/.*\.pdf/)[0];

                // Save metadata to Firestore
                const paperDoc = await addDoc(collection(db, "papers"), {
                    title: paperTitle || file.name,
                    fileName: file.name,
                    authors: authors.split(',').map(a => a.trim()),
                    abstract: abstract,
                    uploadDate: new Date().toISOString(),
                    url: pdfUrl,  // URL from GitHub Issues
                    uploadedBy: auth.currentUser?.uid || 'anonymous',
                    uploadedByEmail: auth.currentUser?.email || 'anonymous'
                });

                // Remove loading indicator and show success message
                loadingDiv.innerHTML = '<div class="alert alert-success">Paper uploaded successfully!</div>';
                setTimeout(() => loadingDiv.remove(), 3000);
                
                console.log('Paper uploaded successfully:', paperDoc.id);
                loadPaperLibrary();
            } catch (error) {
                console.error('Error uploading file:', error);
                alert('Error uploading file. Please try again.');
            }
        } else {
            alert('Please upload a PDF file');
        }
    }

    async function loadPaperLibrary() {
        const papersGrid = document.getElementById('papers-grid');
        papersGrid.innerHTML = ''; // Clear existing content

        try {
            const querySnapshot = await getDocs(collection(db, "papers"));
            querySnapshot.forEach((doc) => {
                const paper = doc.data();
                const paperCard = createPaperCard(paper, doc.id);
                papersGrid.appendChild(paperCard);
            });
        } catch (error) {
            console.error('Error loading papers:', error);
        }
    }

    function createPaperCard(paper, paperId) {
        const div = document.createElement('div');
        div.className = 'col-md-4 mb-4';
        div.innerHTML = `
            <div class="card paper-card">
                <div class="card-body">
                    <h5 class="card-title">${paper.title}</h5>
                    <p class="card-text">
                        <small class="text-muted">
                            Authors: ${paper.authors?.join(', ') || 'Not specified'}<br>
                            Uploaded by: ${paper.uploadedByEmail}<br>
                            Date: ${new Date(paper.uploadDate).toLocaleDateString()}
                        </small>
                    </p>
                    ${paper.abstract ? `<p class="card-text">${paper.abstract}</p>` : ''}
                    <button class="btn btn-primary" onclick="openPaper('${paper.url}', '${paperId}')">
                        Read Paper
                    </button>
                </div>
            </div>
        `;
        return div;
    }

    // Add sign in button handler
    const signInButton = document.getElementById('signInButton');
    
    async function signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        try {
            // Try popup first
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error('Popup error:', error);
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
                alert('Please allow popups for this site to sign in with Google');
            }
        }
    }

    signInButton.addEventListener('click', signInWithGoogle);

    // Update auth state observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log('User is signed in:', user.email);
            signInButton.textContent = 'Sign Out';
            signInButton.onclick = () => {
                auth.signOut();
                window.location.reload(); // Refresh page after sign out
            };
            loadPaperLibrary();
        } else {
            console.log('No user is signed in.');
            signInButton.textContent = 'Sign In';
            signInButton.onclick = signInWithGoogle;
        }
    });

    // PDF viewer initialization
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;

    function renderPage(num) {
        // PDF.js rendering logic will go here
    }

    // Comment system
    function addComment(comment) {
        const commentsList = document.getElementById('comments-list');
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        commentElement.innerHTML = `
            <p>${comment.text}</p>
            <small class="text-muted">Posted by ${comment.user} on ${comment.timestamp}</small>
        `;
        commentsList.appendChild(commentElement);
    }
});

// Update the openPaper function
window.openPaper = async function(url, paperId) {
    const readerSection = document.getElementById('reader-section');
    readerSection.classList.remove('d-none');
    
    try {
        // Load the PDF
        currentPDF = await pdfjsLib.getDocument(url).promise;
        pageCount = currentPDF.numPages;
        
        // Update page count display
        document.getElementById('page_count').textContent = pageCount;
        
        // Load first page
        await renderPage(1);
        
        // Set up page navigation
        document.getElementById('prev').onclick = () => {
            if (currentPage > 1) {
                renderPage(currentPage - 1);
            }
        };
        
        document.getElementById('next').onclick = () => {
            if (currentPage < pageCount) {
                renderPage(currentPage + 1);
            }
        };

        // Load comments for this paper
        loadComments(paperId);

    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF. Please make sure the file exists in the repository.');
    }
};

async function renderPage(pageNumber) {
    try {
        const page = await currentPDF.getPage(pageNumber);
        const canvas = document.getElementById('pdf-viewer');
        const ctx = canvas.getContext('2d');
        
        // Set scale for good resolution
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Render PDF page
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;
        
        // Update page number display
        currentPage = pageNumber;
        document.getElementById('page_num').textContent = pageNumber;
        
    } catch (error) {
        console.error('Error rendering page:', error);
    }
}

// Add comment functionality
async function loadComments(paperId) {
    const commentsRef = collection(db, "papers", paperId, "comments");
    const querySnapshot = await getDocs(commentsRef);
    const commentsList = document.getElementById('comments-list');
    commentsList.innerHTML = '';
    
    querySnapshot.forEach((doc) => {
        const comment = doc.data();
        addCommentToUI(comment);
    });
    
    // Set up comment posting
    const postButton = document.getElementById('postComment');
    const commentText = document.getElementById('commentText');
    
    postButton.onclick = async () => {
        if (!commentText.value.trim()) return;
        
        const comment = {
            text: commentText.value,
            user: auth.currentUser.email,
            timestamp: new Date().toISOString(),
            page: currentPage
        };
        
        try {
            await addDoc(collection(db, "papers", paperId, "comments"), comment);
            addCommentToUI(comment);
            commentText.value = '';
        } catch (error) {
            console.error('Error posting comment:', error);
        }
    };
}

function addCommentToUI(comment) {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment p-2 mb-2 border-bottom';
    commentElement.innerHTML = `
        <p>${comment.text}</p>
        <small class="text-muted">
            Posted by ${comment.user} on page ${comment.page}<br>
            ${new Date(comment.timestamp).toLocaleString()}
        </small>
    `;
    document.getElementById('comments-list').appendChild(commentElement);
} 