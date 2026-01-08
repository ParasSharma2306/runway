import { loadState, saveState } from './storage.js';
import { calculateForecast } from './engine.js';
import { simulateScenario } from './simulate.js';
import { showToast } from './toast.js';
import { escapeHTML, roundMoney, uuid } from './utils.js';

const DEFAULT_STATE = {
    balance: 0,
    buffer: 0,
    transactions: [],
    planned: [],
    settings: { syncEnabled: false }
};

const elRunway = document.getElementById('val-runway');
const elBalance = document.getElementById('val-balance');
const elBurn = document.getElementById('val-burn');
let elRunwaySub = null; 

const modalLog = document.getElementById('modal-log');
const modalHistory = document.getElementById('modal-history');
const modalPlan = document.getElementById('modal-plan');
const modalSim = document.getElementById('modal-sim');
const modalResult = document.getElementById('modal-result');

let currentState = null;
let editingTransactionId = null; 
let editingPlanId = null;

const getLocalISODate = (timestamp) => {
    const d = timestamp ? new Date(timestamp) : new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const performSync = async () => {
    if (!currentState || !currentState.settings || !currentState.settings.syncEnabled) return;
    try {
        const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactions: currentState.transactions,
                lastSyncTime: currentState.lastSync || 0,
                balance: currentState.balance,
                buffer: currentState.buffer,
                planned: currentState.planned
            })
        });

        if (res.status === 401) {
            currentState.settings.syncEnabled = false;
            await saveState(currentState);
            return showToast('Login required to sync', 'error');
        }
        if (!res.ok) throw new Error('Sync failed');
        
        const data = await res.json();

        if (data.transactions && data.transactions.length > 0) {
            currentState.transactions = data.transactions;
        }
        
        if (typeof data.balance === 'number') currentState.balance = data.balance;
        if (typeof data.buffer === 'number') currentState.buffer = data.buffer;
        if (Array.isArray(data.planned)) currentState.planned = data.planned;

        currentState.lastSync = data.syncedAt;
        await saveState(currentState);
        render(); 
        
        if(modalHistory && modalHistory.classList.contains('active')) renderHistoryList();
    } catch (err) {
        console.error(err);
    }
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

const render = () => {
    if (!currentState) return;
    const forecast = calculateForecast(
        currentState.balance, 
        currentState.transactions, 
        currentState.buffer, 
        Date.now(),
        currentState.planned
    );

    elBalance.textContent = formatCurrency(currentState.balance);
    elBurn.textContent = formatCurrency(forecast.burnRate) + '/day';
    
    if (forecast.runwayDays === Infinity || forecast.runwayDays >= 730) {
        elRunway.textContent = '∞';
        if(elRunwaySub) elRunwaySub.textContent = 'Sustainable';
    } else {
        elRunway.textContent = Math.floor(forecast.runwayDays);
        if (!elRunwaySub) {
            elRunwaySub = document.createElement('div');
            elRunwaySub.id = 'runway-sub';
            elRunwaySub.style.fontSize = '12px';
            elRunwaySub.style.opacity = '0.7';
            elRunwaySub.style.marginTop = '-4px';
            elRunway.parentNode.appendChild(elRunwaySub);
        }
        elRunwaySub.textContent = `${Math.floor(forecast.runwayRange.min)} - ${Math.floor(forecast.runwayRange.max)} days (95% Confidence)`;
    }
    
    const colorMap = {
        'CRITICAL_BELOW_BUFFER': 'var(--status-negative)',
        'DANGER': '#FF9F0A',
        'WARNING': '#FFD60A',
        'HEALTHY': 'inherit',
        'SUSTAINABLE': 'var(--status-positive)'
    };
    elRunway.style.color = colorMap[forecast.status] || 'inherit';
};

const openModal = (modal) => {
    if(!modal) return;
    modal.classList.add('active');
    const input = modal.querySelector('input');
    if(input && !modal.classList.contains('no-focus') && input.type !== 'date') {
        setTimeout(() => input.focus(), 100);
    }
};

const closeModal = (modal) => {
    if(!modal) return;
    modal.classList.remove('active');
    
    if (modal === modalLog) editingTransactionId = null;
    if (modal === modalPlan) editingPlanId = null;
};

const initLogModal = () => {
    const btnTrigger = document.getElementById('btn-log');
    const btnCancel = document.getElementById('btn-log-cancel');
    const btnConfirm = document.getElementById('btn-log-confirm');
    const btnExpense = document.getElementById('type-expense');
    const btnIncome = document.getElementById('type-income');
    const inpAmount = document.getElementById('inp-log-amount');
    const inpNote = document.getElementById('inp-log-note');
    const inpDate = document.getElementById('inp-log-date');
    const titleEl = modalLog ? modalLog.querySelector('.modal-title') : null;
    let currentType = 'expense';

    const setType = (type) => {
        currentType = type;
        if(type === 'expense') {
            btnExpense.classList.add('active');
            btnIncome.classList.remove('active');
        } else {
            btnIncome.classList.add('active');
            btnExpense.classList.remove('active');
        }
    };

    if (btnTrigger) btnTrigger.onclick = () => {
        editingTransactionId = null;
        if(titleEl) titleEl.textContent = 'Log Transaction';
        inpAmount.value = '';
        inpNote.value = '';
        inpDate.value = getLocalISODate(); 
        setType('expense');
        openModal(modalLog);
    };
    
    if(btnCancel) btnCancel.onclick = () => closeModal(modalLog);
    if(btnExpense) btnExpense.onclick = () => setType('expense');
    if(btnIncome) btnIncome.onclick = () => setType('income');

    if(btnConfirm) btnConfirm.onclick = async () => {
        const amount = parseFloat(inpAmount.value);
        const note = inpNote.value.trim();
        const dateStr = inpDate.value;
        
        if (isNaN(amount) || amount <= 0) return showToast('Invalid amount', 'error');
        if (!dateStr) return showToast('Date required', 'error');

        const timestamp = new Date(dateStr).getTime();

        if (editingTransactionId) {
            const txIndex = currentState.transactions.findIndex(t => t.id === editingTransactionId);
            if (txIndex > -1) {
                const oldTx = currentState.transactions[txIndex];
                
                if (oldTx.type === 'expense') currentState.balance += oldTx.amount;
                else currentState.balance -= oldTx.amount;

                if (currentType === 'expense') currentState.balance -= amount;
                else currentState.balance += amount;

                currentState.transactions[txIndex] = { 
                    ...oldTx, type: currentType, amount: roundMoney(amount), note, timestamp 
                };
                showToast('Updated', 'success');
            } else {
                editingTransactionId = null; 
            }
        } 
        
        if (!editingTransactionId) {
            if (currentType === 'expense') currentState.balance -= amount;
            else currentState.balance += amount;

            currentState.transactions.push({
                id: uuid(), type: currentType, amount: roundMoney(amount), note, timestamp
            });
            showToast('Saved', 'success');
        }

        currentState.balance = roundMoney(currentState.balance);
        await saveState(currentState);
        render();
        if (currentState.settings && currentState.settings.syncEnabled) performSync();
        if (modalHistory && modalHistory.classList.contains('active')) renderHistoryList();
        closeModal(modalLog);
    };
};

const openEditLog = (id) => {
    const tx = currentState.transactions.find(t => t.id === id);
    if (!tx) return;
    
    editingTransactionId = id;
    const titleEl = modalLog.querySelector('.modal-title');
    titleEl.textContent = 'Edit Transaction';
    
    document.getElementById('inp-log-amount').value = tx.amount;
    document.getElementById('inp-log-note').value = tx.note || '';
    document.getElementById('inp-log-date').value = getLocalISODate(tx.timestamp);

    if (tx.type === 'expense') document.getElementById('type-expense').click();
    else document.getElementById('type-income').click();
    
    openModal(modalLog);
};

const renderHistoryListLogic = (target) => {
    const list = [...currentState.transactions].sort((a, b) => b.timestamp - a.timestamp);
    
    if (list.length === 0) {
        target.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">No transactions</div>';
        return;
    }

    target.innerHTML = list.map(t => `
        <div class="list-item-row">
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 15px;">${escapeHTML(t.note) || (t.type === 'expense' ? 'Expense' : 'Income')}</div>
                <div style="font-size: 11px; opacity: 0.6;">${new Date(t.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
            <div style="text-align: right; margin-right: 12px;">
                <div style="font-weight: 700; color: ${t.type === 'expense' ? 'var(--status-negative)' : 'var(--status-positive)'}">
                    ${t.type === 'expense' ? '-' : '+'}${formatCurrency(t.amount)}
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn-icon-small btn-edit-tx" data-id="${t.id}">✎</button>
                <button class="btn-icon-small btn-delete-tx" data-id="${t.id}">✕</button>
            </div>
        </div>
    `).join('');

    target.querySelectorAll('.btn-edit-tx').forEach(btn => btn.onclick = (e) => openEditLog(e.target.dataset.id));
    target.querySelectorAll('.btn-delete-tx').forEach(btn => btn.onclick = async (e) => {
        const id = e.target.dataset.id;
        const tx = currentState.transactions.find(t => t.id === id);
        if (!tx) return;
        if(!confirm('Delete transaction?')) return;
        
        if (tx.type === 'expense') currentState.balance += tx.amount;
        else currentState.balance -= tx.amount;
        
        currentState.transactions = currentState.transactions.filter(x => x.id !== id);
        currentState.balance = roundMoney(currentState.balance);
        
        await saveState(currentState);
        render();
        renderHistoryList(); 
        if (currentState.settings && currentState.settings.syncEnabled) performSync();
    });
};

const renderHistoryList = () => {
    const mobileList = document.getElementById('history-list-full');
    if(mobileList) renderHistoryListLogic(mobileList);
};

const initHistoryModal = () => {
    const btnMobile = document.getElementById('btn-history');
    const close = document.getElementById('btn-history-close');
    
    if(btnMobile) btnMobile.onclick = () => { 
        renderHistoryList(); 
        openModal(modalHistory); 
    };
    if(close) close.onclick = () => closeModal(modalHistory);
};

const renderPlanList = () => {
    const container = document.getElementById('plan-list');
    if(!container) return;
    const list = [...(currentState.planned || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (list.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">No plans</div>';
        return;
    }
    container.innerHTML = list.map(p => `
        <div class="list-item-row">
            <div style="flex: 1;">
                <div style="font-weight: 600;">${escapeHTML(p.title)}</div>
                <div style="font-size: 11px; opacity: 0.6;">Due: ${p.date}</div>
            </div>
            <div style="font-weight: 600; margin-right: 12px;">${formatCurrency(p.amount)}</div>
            <div style="display:flex; gap:8px;">
                <button class="btn-icon-small btn-edit-plan" data-id="${p.id}">✎</button>
                <button class="btn-icon-small btn-delete-plan" data-id="${p.id}">✕</button>
            </div>
        </div>
    `).join('');
    
    container.querySelectorAll('.btn-edit-plan').forEach(btn => btn.onclick = (e) => prepareEditPlan(e.target.dataset.id));
    container.querySelectorAll('.btn-delete-plan').forEach(btn => btn.onclick = async (e) => {
        currentState.planned = currentState.planned.filter(x => x.id !== e.target.dataset.id);
        await saveState(currentState);
        renderPlanList();
        render();
    });
};

const prepareEditPlan = (id) => {
    const p = currentState.planned.find(x => x.id === id);
    if(!p) return;
    editingPlanId = id;
    document.getElementById('inp-plan-title').value = p.title;
    document.getElementById('inp-plan-amount').value = p.amount;
    document.getElementById('inp-plan-date').value = p.date;
    document.getElementById('btn-add-plan').textContent = 'Update';
};

const initPlanModal = () => {
    const btn = document.getElementById('btn-plan');
    const close = document.getElementById('btn-plan-close');
    const btnAdd = document.getElementById('btn-add-plan');
    const inpDate = document.getElementById('inp-plan-date');

    if(btn) btn.onclick = () => {
        if(!currentState.planned) currentState.planned = [];
        editingPlanId = null;
        document.getElementById('inp-plan-title').value = '';
        document.getElementById('inp-plan-amount').value = '';
        const today = getLocalISODate();
        inpDate.value = today;
        inpDate.min = today;
        document.getElementById('btn-add-plan').textContent = 'Add Upcoming';
        renderPlanList();
        openModal(modalPlan);
    };
    if(close) close.onclick = () => closeModal(modalPlan);
    if(btnAdd) btnAdd.onclick = async () => {
        const title = document.getElementById('inp-plan-title').value.trim();
        const amount = parseFloat(document.getElementById('inp-plan-amount').value);
        const date = document.getElementById('inp-plan-date').value;

        if(!title || isNaN(amount) || !date) return showToast('Required fields missing', 'error');
        if (new Date(date).getTime() < new Date(getLocalISODate()).getTime()) return showToast('Date cannot be in the past', 'error');

        const planObj = { id: editingPlanId || uuid(), title, amount: roundMoney(amount), date };
        
        if (editingPlanId) {
            const idx = currentState.planned.findIndex(p => p.id === editingPlanId);
            if (idx > -1) currentState.planned[idx] = planObj;
            editingPlanId = null;
            btnAdd.textContent = 'Add Upcoming';
        } else {
            currentState.planned.push(planObj);
        }
        await saveState(currentState);
        document.getElementById('inp-plan-title').value = '';
        document.getElementById('inp-plan-amount').value = '';
        renderPlanList();
        render();
    };
};

const initSimModal = () => {
    const btnTrigger = document.getElementById('btn-simulate');
    const btnCancel = document.getElementById('btn-sim-cancel');
    const btnConfirm = document.getElementById('btn-sim-confirm');
    const btnCloseResult = document.getElementById('btn-result-close');
    if (btnTrigger) btnTrigger.onclick = () => openModal(modalSim);
    if (btnCancel) btnCancel.onclick = () => closeModal(modalSim);
    if (btnCloseResult) btnCloseResult.onclick = () => closeModal(modalResult);

    if (btnConfirm) btnConfirm.onclick = () => {
        const amount = parseFloat(document.getElementById('inp-sim-amount').value);
        if (isNaN(amount) || amount <= 0) return;
        closeModal(modalSim);

        const scenario = simulateScenario(currentState, [{ amount }]);
        
        const resultHTML = `
            <strong>Hypothetical Spend:</strong> ${formatCurrency(scenario.delta.cost)}<br/>
            <hr style="border:0; border-top:1px solid var(--border-default); margin:12px 0;">
            <div style="font-size:14px; color:var(--text-secondary); margin-bottom:12px;">
                New Runway: <strong>${Math.floor(scenario.simulated.runwayDays)} days</strong>
            </div>
            <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; border-left: 3px solid ${scenario.analysis.riskColor}">
                <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-secondary);">Analysis</div>
                <div style="font-size:16px; font-weight:600; margin:4px 0;">Risk: ${scenario.analysis.riskLevel}</div>
                <div style="font-size:13px; opacity:0.8;">${scenario.analysis.advice}</div>
            </div>
        `;
        document.getElementById('sim-result-content').innerHTML = resultHTML;
        openModal(modalResult);
    };
};

const init = async () => {
    currentState = await loadState();
    if (!currentState) { currentState = DEFAULT_STATE; await saveState(currentState); }
    if (!currentState.settings) currentState.settings = { syncEnabled: false };
    if (!currentState.transactions) currentState.transactions = [];
    if (!currentState.planned) currentState.planned = [];
    
    initLogModal();
    initHistoryModal();
    initPlanModal();
    initSimModal();
    render();
    if (currentState.settings.syncEnabled) setTimeout(performSync, 1000);
};

init();

export { loadState, saveState, performSync };