const MS_PER_DAY = 86400000;
const SIMULATION_RUNS = 2000; 
const MAX_HORIZON_DAYS = 730; 

const safeNum = (val) => (typeof val === 'number' && isFinite(val) ? val : 0);

const extractDailyVector = (transactions, now) => {
    const expenses = transactions
        .filter(t => t.type === 'expense' && t.timestamp <= now)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (expenses.length === 0) return [];

    const firstDate = new Date(expenses[0].timestamp).setHours(0,0,0,0);
    const lastDate = new Date(now).setHours(0,0,0,0);
    const totalDays = Math.max(1, Math.ceil((lastDate - firstDate) / MS_PER_DAY)) + 1;

    const vector = new Array(totalDays).fill(0);

    expenses.forEach(t => {
        const tDate = new Date(t.timestamp).setHours(0,0,0,0);
        const index = Math.floor((tDate - firstDate) / MS_PER_DAY);
        if (index >= 0 && index < totalDays) {
            vector[index] += t.amount;
        }
    });

    return vector;
};

const calculateBurnStats = (vector) => {
    if (vector.length === 0) return { mean: 0 };
    const sum = vector.reduce((a, b) => a + b, 0);
    return { mean: sum / vector.length };
};

// Bootstrap Monte Carlo Forecast
const calculateForecast = (currentBalance, transactions, bufferAmount, now, plannedPayments = []) => {
    const startBalance = safeNum(currentBalance);
    const buffer = safeNum(bufferAmount);
    
    // Get History Vector
    const dailyVector = extractDailyVector(transactions, now);
    
    let samplingVector = dailyVector;
    if (dailyVector.length < 5) {
        const avg = dailyVector.length ? (dailyVector.reduce((a,b)=>a+b,0)/dailyVector.length) : 0;
        samplingVector = [...dailyVector, avg, 0, 0, 0]; 
    }

    const burnStats = calculateBurnStats(dailyVector);
    
    // Sort plans
    const plans = plannedPayments
        .filter(p => new Date(p.date).getTime() > now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Run Simulations
    const failures = []; 

    for (let i = 0; i < SIMULATION_RUNS; i++) {
        let simBalance = startBalance - buffer;
        let daysSurvived = 0;
        let currentDate = now;
        let planIndex = 0;

        while (simBalance > 0 && daysSurvived < MAX_HORIZON_DAYS) {
            const randomIdx = Math.floor(Math.random() * samplingVector.length);
            let dailySpend = samplingVector[randomIdx];
            
            dailySpend = dailySpend * (0.9 + Math.random() * 0.2); 

            simBalance -= dailySpend;

            currentDate += MS_PER_DAY;
            daysSurvived++;

            while(planIndex < plans.length && new Date(plans[planIndex].date).getTime() <= currentDate) {
                simBalance -= plans[planIndex].amount;
                planIndex++;
            }
        }
        failures.push(daysSurvived);
    }

    failures.sort((a, b) => a - b);
    
    const medianRunway = failures[Math.floor(SIMULATION_RUNS * 0.5)];
    const pessimisticRunway = failures[Math.floor(SIMULATION_RUNS * 0.1)];

    // Risk Calculation (Linear Interpolation)
    // 30 days = 100% Risk | 90 days = 0% Risk
    // Formula: (MaxDays - CurrentDays) / (MaxDays - MinDays) * 100
    let riskScore = 0;
    if (medianRunway < 30) {
        riskScore = 100;
    } else if (medianRunway > 90) {
        riskScore = 0;
    } else {
        // Between 30 and 90
        riskScore = Math.round(((90 - medianRunway) / 60) * 100);
    }

    let status = 'HEALTHY';
    if (startBalance < buffer) status = 'CRITICAL_BELOW_BUFFER';
    else if (medianRunway < 30) status = 'DANGER';
    else if (medianRunway < 90) status = 'WARNING';
    else if (medianRunway >= MAX_HORIZON_DAYS) status = 'SUSTAINABLE';

    return {
        burnRate: burnStats.mean,
        runwayDays: medianRunway,
        runwayRange: { min: pessimisticRunway, max: failures[Math.floor(SIMULATION_RUNS * 0.9)] },
        status: status,
        riskScore: riskScore,
        zeroDate: (medianRunway < MAX_HORIZON_DAYS) ? (now + (medianRunway * MS_PER_DAY)) : null
    };
};

export { calculateForecast };