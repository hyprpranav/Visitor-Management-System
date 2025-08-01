document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api';

    // Sanitize input to prevent XSS
    const sanitizeInput = (input) => {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    };

    // Show/hide sections
    const showSection = (sectionId) => {
        document.querySelectorAll('.container').forEach(container => container.style.display = 'none');
        document.getElementById(sectionId).style.display = 'block';
    };

    // Show toast notifications
    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} show`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} toast-icon"></i>
            <span class="toast-message">${sanitizeInput(message)}</span>
            <i class="fas fa-times toast-close"></i>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    };

    // Debounce function for search
    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    // Fetch and display visitor stats
    const updateStats = async () => {
        try {
            const response = await fetch(`${API_URL}/stats`);
            if (!response.ok) throw new Error('Failed to fetch stats');
            const data = await response.json();
            document.querySelector('.count-value[title="Checked In"]').textContent = data.checked_in;
            document.querySelector('.count-value[title="Checked Out"]').textContent = data.checked_out;
            document.querySelector('.count-value[title="Total Visitors"]').textContent = data.total;
        } catch (error) {
            showToast('Error fetching stats: ' + error.message, 'error');
        }
    };

    // Fetch and display visitor history
    const updateHistory = async (search = '', tableId = 'visitorTable') => {
        try {
            const response = await fetch(`${API_URL}/history?search=${encodeURIComponent(search)}`);
            const data = await response.json();
            const tableBody = document.querySelector(`#${tableId} tbody`);
            tableBody.innerHTML = '';
            if (!data.visitors || data.visitors.length === 0) {
                const emptyState = document.querySelector(`#${tableId}`).parentElement.querySelector('.empty-state');
                if (emptyState) emptyState.style.display = 'block';
                if (search) showToast('No visitors found matching the search criteria', 'error');
                return;
            }
            const emptyState = document.querySelector(`#${tableId}`).parentElement.querySelector('.empty-state');
            if (emptyState) emptyState.style.display = 'none';
            data.visitors.forEach(visitor => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${sanitizeInput(visitor.name || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.contact || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.email || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.company || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.purpose || 'N/A')}</td>
                    <td>${visitor.nda_signed ? 'Yes' : 'No'}</td>
                    <td>${sanitizeInput(visitor.entry_method || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.liveness_check || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.checkin_time || 'N/A')}</td>
                    <td>${sanitizeInput(visitor.checkout_time || 'N/A')}</td>
                    <td><span class="badge badge-${visitor.status === 'Checked In' ? 'success' : 'warning'}">${sanitizeInput(visitor.status)}</span></td>
                    ${tableId === 'adminVisitorTable' ? `<td><span class="badge badge-${visitor.overstay ? 'danger' : 'success'}">${visitor.overstay ? 'Overstay' : 'Normal'}</span></td>` : ''}
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            showToast('Error fetching history: ' + error.message, 'error');
        }
    };

    // Card click handlers
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const section = card.dataset.section;
            if (section === 'exit') {
                showSection('dashboard');
            } else {
                showSection(section);
                if (section === 'detailsSection') {
                    updateStats();
                    updateHistory();
                    setTimeout(() => {
                        const table = document.getElementById('visitorTable');
                        if (table) table.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 200);
                } else if (section === 'adminSection') {
                    updateHistory('', 'adminVisitorTable');
                }
            }
        });
    });

    // Back buttons
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.container').forEach(container => container.style.display = 'none');
            showSection('dashboard');
        });
    });

    // Connectivity check utility
    async function checkApiConnection() {
        try {
            const resp = await fetch(`${API_URL}/stats`, { method: 'GET' });
            if (!resp.ok) throw new Error('API not reachable');
            return true;
        } catch {
            return false;
        }
    }

    // On page load, check API connection
    checkApiConnection().then(ok => {
        if (!ok) showToast('Cannot connect to server. Please ensure the backend is running at ' + API_URL, 'error');
    });

    // Check-in form
    const checkinForm = document.getElementById('checkinForm');
    if (checkinForm) {
        checkinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const contact = (formData.get('contact') || '').trim();
            if (!/^\d{10}$/.test(contact)) {
                showToast('Contact number must be exactly 10 digits.', 'error');
                return;
            }
            const data = {
                name: sanitizeInput(formData.get('name') || ''),
                contact: sanitizeInput(contact),
                email: sanitizeInput(formData.get('email') || ''),
                purpose: sanitizeInput(formData.get('purpose') || ''),
                nda_signed: formData.get('nda') === 'on',
                entry_method: sanitizeInput(formData.get('entryMethod') || 'manual'),
                photo: 'placeholder.png',
                liveness_check: 'N/A'
            };
            console.log('Check-in data:', data); // Debug log
            if (!data.name || !data.contact || !data.purpose) {
                showToast('Please fill in all required fields (Name, Contact, Purpose)', 'error');
                return;
            }
            if (!(await checkApiConnection())) {
                showToast('Cannot connect to server. Please ensure the backend is running at ' + API_URL, 'error');
                return;
            }
            try {
                const response = await fetch(`${API_URL}/checkin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                let result;
                try {
                    result = await response.json();
                } catch {
                    throw new Error('Server error: Invalid response');
                }
                if (!response.ok) throw new Error(result.error || result.detail || 'Check-in failed');
                showToast(result.message);
                e.target.reset();
                if (document.getElementById('detailsSection').style.display === 'block') {
                    updateStats();
                    updateHistory();
                }
            } catch (error) {
                if (error.message === 'Failed to fetch') {
                    showToast('Cannot connect to server. Please ensure the backend is running at ' + API_URL, 'error');
                } else {
                    showToast('Check-in failed: ' + error.message, 'error');
                }
            }
        });
    }

    // Check-out form
    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = { contact: sanitizeInput(formData.get('contact') || '') };
        if (!data.contact) {
            showToast('Please enter a contact number', 'error');
            return;
        }
        try {
            const response = await fetch(`${API_URL}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error('Server error: Invalid response');
            }
            if (!response.ok) throw new Error(result.error || result.detail || 'Check-out failed');
            showToast(result.message);
            e.target.reset();
            if (document.getElementById('detailsSection').style.display === 'block') {
                updateStats();
                updateHistory();
            }
        } catch (error) {
            showToast('Check-out failed: ' + error.message, 'error');
        }
    });

    // Settings modal logic
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.querySelector('.settings-modal');
    const settingsClose = document.querySelector('.settings-close');
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    settingsClose.addEventListener('click', () => settingsModal.classList.remove('active'));
    document.getElementById('themeGradient').addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
        const darkThemes = ['dark', 'galaxy', 'cyber'];
        if (darkThemes.includes(e.target.value)) {
            document.body.style.backgroundColor = '#232946';
        } else {
            document.body.style.backgroundColor = '';
        }
    });
    document.getElementById('toggleDarkMode').addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'default' : 'dark');
    });

    // Help modal logic
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.querySelector('.help-modal');
    const helpClose = document.querySelector('.help-close');
    helpBtn.addEventListener('click', () => { helpModal.style.display = 'flex'; });
    helpClose.addEventListener('click', () => { helpModal.style.display = 'none'; });

    // Feedback modal logic
    const feedbackIcon = document.querySelector('.feedback-icon');
    if (feedbackIcon) {
        feedbackIcon.addEventListener('click', (e) => {
            window.open('mailto:harishspranav2006@gmail.com?subject=VMS%20Feedback', '_blank');
        });
    }
    const feedbackModal = document.querySelector('.feedback-modal');
    feedbackIcon.addEventListener('click', () => feedbackModal.classList.add('active'));
    document.querySelector('.feedback-close').addEventListener('click', () => {
        feedbackModal.classList.remove('active');
        document.getElementById('feedbackForm').reset();
    });

    document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            type: document.querySelector('.feedback-type-btn.active')?.dataset.type || 'help',
            name: sanitizeInput(formData.get('name') || ''),
            email: sanitizeInput(formData.get('email') || ''),
            message: sanitizeInput(formData.get('message') || '')
        };
        if (!data.message) {
            showToast('Please enter a feedback message', 'error');
            return;
        }
        try {
            const response = await fetch(`${API_URL}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Feedback submission failed');
            showToast(result.message);
            feedbackModal.classList.remove('active');
            e.target.reset();
        } catch (error) {
            showToast('Feedback submission failed: ' + error.message, 'error');
        }
    });

    // Biometric mock
    const fingerprintBtn = document.querySelector('.biometric-button.fingerprint');
    if (fingerprintBtn) {
        fingerprintBtn.addEventListener('click', () => {
            fingerprintBtn.classList.add('scanning');
            fingerprintBtn.textContent = 'Scanning...';
            setTimeout(() => {
                fingerprintBtn.classList.remove('scanning');
                fingerprintBtn.textContent = 'Scan Fingerprint';
                showToast('Fingerprint scan simulated', 'success');
            }, 2000);
        });
    }

    // Admin search
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            updateHistory(sanitizeInput(e.target.value), 'adminVisitorTable');
        }, 500));
    }

    // QR Code generation and WhatsApp sharing
    const generateQrBtn = document.querySelector('#generateQrBtn');
    if (generateQrBtn) {
        generateQrBtn.addEventListener('click', async () => {
            const contact = sanitizeInput(document.getElementById('qrContact').value);
            if (!contact) return showToast('Please enter a contact number', 'error');
            try {
                const response = await fetch(`${API_URL}/generate-qr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contact })
                });
                if (!response.ok) throw new Error('QR code generation failed');
                const blob = await response.blob();
                const qrCodeImg = document.getElementById('qrCodeImg');
                qrCodeImg.src = URL.createObjectURL(blob);
                qrCodeImg.style.display = 'block';
                const preRegUrl = `http://localhost:5000/preregister?contact=${encodeURIComponent(contact)}`;
                const whatsappLink = `https://wa.me/?text=Pre-register your visit: ${encodeURIComponent(preRegUrl)}`;
                const whatsappShare = document.getElementById('whatsappShare');
                whatsappShare.href = whatsappLink;
                whatsappShare.style.display = 'inline-flex';
                showToast('QR code generated and ready to share!');
            } catch (error) {
                showToast('QR code generation failed: ' + error.message, 'error');
            }
        });
    }

    // Export logs
    document.getElementById('exportLogsBtn').addEventListener('click', async () => {
        try {
            const response = await fetch(`${API_URL}/export`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Export failed');
            }
            const blob = await response.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'visitor_logs.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Logs exported successfully');
        } catch (error) {
            showToast('Export failed: ' + error.message, 'error');
        }
    });

    // --- Pre-Registration Notification Logic (Backend Integrated) ---
    async function fetchPendingPreregistrations() {
        const res = await fetch('/api/preregistrations');
        if (!res.ok) return [];
        const data = await res.json();
        return data.preregistrations || [];
    }

    async function updateNotificationModal() {
        const notificationModalBody = document.getElementById('notificationModalBody');
        if (!notificationModalBody) return;
        const preregs = await fetchPendingPreregistrations();
        notificationModalBody.innerHTML = '';
        if (!preregs.length) {
            notificationModalBody.textContent = 'No new notifications.';
            document.getElementById('notificationBadge').style.display = 'none';
            return;
        }
        document.getElementById('notificationBadge').style.display = 'inline-block';
        document.getElementById('notificationBadge').textContent = preregs.length;
        preregs.forEach(visitor => {
            const notif = document.createElement('div');
            notif.className = 'notification-item';
            notif.style = 'margin-bottom: 1.2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem;';
            notif.innerHTML = `
                <div><b>Pre-Registration Request</b></div>
                <div>Name: ${visitor.name}</div>
                <div>Contact: ${visitor.contact}</div>
                <div>Email: ${visitor.email || 'N/A'}</div>
                <div>Date: ${visitor.visitDate || visitor.visit_date} Time: ${visitor.visitTime || visitor.visit_time}</div>
                <button class="btn btn-success btn-sm approve-pre" style="margin-right:8px;">Approve</button>
                <button class="btn btn-danger btn-sm decline-pre">Decline</button>
            `;
            notif.querySelector('.approve-pre').onclick = async function() {
                try {
                    const response = await fetch(`/api/preregistrations/${visitor.id}/approve`, { method: 'POST' });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Approval failed');
                    notif.innerHTML = `<span style="color:green;">${result.message}</span>`;
                    showToast(result.message, 'success');
                    updateNotificationModal();
                    updateHistory('', 'adminVisitorTable');
                } catch (error) {
                    showToast('Approval failed: ' + error.message, 'error');
                }
            };
            notif.querySelector('.decline-pre').onclick = async function() {
                try {
                    const response = await fetch(`/api/preregistrations/${visitor.id}/decline`, { method: 'POST' });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Decline failed');
                    notif.innerHTML = '<span style="color:red;">Declined ✔️</span>';
                    showToast(result.message, 'success');
                    updateNotificationModal();
                } catch (error) {
                    showToast('Decline failed: ' + error.message, 'error');
                }
            };
            notificationModalBody.appendChild(notif);
        });
    }

    // Notification icon click handler
    const notificationIcon = document.getElementById('notificationIcon');
    const notificationModal = document.getElementById('notificationModal');
    const closeNotificationModal = document.getElementById('closeNotificationModal');
    notificationIcon && notificationIcon.addEventListener('click', () => {
        notificationModal.style.display = 'flex';
        updateNotificationModal();
    });
    closeNotificationModal && closeNotificationModal.addEventListener('click', () => {
        notificationModal.style.display = 'none';
    });
    notificationModal && notificationModal.addEventListener('click', (e) => {
        if (e.target === notificationModal) notificationModal.style.display = 'none';
    });

    // --- Pre-Registration Form Handler ---
    const preRegForm = document.getElementById('preRegistrationForm');
    const preRegPendingMsg = document.getElementById('preRegPendingMsg');
    if (preRegForm) {
        preRegForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(preRegForm);
            const visitor = {
                name: sanitizeInput(formData.get('name') || ''),
                contact: sanitizeInput(formData.get('contact') || ''),
                email: sanitizeInput(formData.get('email') || ''),
                company: sanitizeInput(formData.get('company') || ''),
                purpose: sanitizeInput(formData.get('purpose') || ''),
                visitDate: formData.get('visitDate'),
                visitTime: formData.get('visitTime'),
                nda_signed: formData.get('nda') === 'on'
            };
            if (!visitor.name || !visitor.contact || !visitor.purpose || !visitor.visitDate || !visitor.visitTime) {
                showToast('Please fill in all required fields', 'error');
                return;
            }
            try {
                const res = await fetch('/api/preregister', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(visitor)
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('Pre-registration submitted successfully! Awaiting admin approval.', 'success');
                    preRegForm.reset();
                    preRegForm.style.display = 'none';
                    if (preRegPendingMsg) preRegPendingMsg.style.display = 'block';
                } else {
                    showToast(data.error || 'Failed to submit pre-registration.', 'error');
                }
            } catch (err) {
                showToast('Failed to submit pre-registration: ' + err.message, 'error');
            }
        });
    }

    // --- Notification Badge Update on Page Load and Periodically ---
    async function updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;
        try {
            const res = await fetch('/api/preregistrations');
            if (!res.ok) {
                badge.style.display = 'none';
                return;
            }
            const data = await res.json();
            const count = (data.preregistrations || []).length;
            if (count > 0) {
                badge.style.display = 'inline-block';
                badge.textContent = count;
            } else {
                badge.style.display = 'none';
            }
        } catch {
            badge.style.display = 'none';
        }
    }
    // Call on page load
    updateNotificationBadge();
    // Optionally, poll every 30 seconds for new requests
    setInterval(updateNotificationBadge, 30000);

    // Mobile-first design switch
    const mobileSwitchBtn = document.getElementById('mobileSwitchBtn');
    if (mobileSwitchBtn) {
        mobileSwitchBtn.addEventListener('click', () => {
            document.body.classList.toggle('mobile-first');
            // Optionally, change icon to desktop/mobile
            const icon = mobileSwitchBtn.querySelector('i');
            if (document.body.classList.contains('mobile-first')) {
                icon.classList.remove('fa-mobile-alt');
                icon.classList.add('fa-desktop');
                mobileSwitchBtn.title = 'Switch to Desktop View';
            } else {
                icon.classList.remove('fa-desktop');
                icon.classList.add('fa-mobile-alt');
                mobileSwitchBtn.title = 'Switch to Mobile View';
            }
        });
    }
});