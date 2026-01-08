import { calculateForecast } from './engine.js';

const simulateScenario = (currentState, hypotheticalSpends) => {
    const baseState = JSON.parse(JSON.stringify(currentState));
    
    const simSpends = Array.isArray(hypotheticalSpends) 
        ? hypotheticalSpends.map(s => ({ ...s })) 
        : [];

    const now = Date.now();

    const baseline = calculateForecast(
        baseState.balance,
        baseState.transactions,
        baseState.buffer,
        now,
        baseState.planned
    );

    const totalSimCost = simSpends.reduce((sum, s) => sum + (s.amount || 0), 0);
    const newBalance = baseState.balance - totalSimCost;
    
    const simulated = calculateForecast(
        newBalance,
        baseState.transactions,
        baseState.buffer,
        now,
        baseState.planned
    );

    const oldRunway = baseline.runwayDays === Infinity ? 730 : baseline.runwayDays;
    const newRunway = simulated.runwayDays === Infinity ? 730 : simulated.runwayDays;
    const daysLost = Math.max(0, oldRunway - newRunway);
    
    let advice = "No significant impact.";
    let riskLevel = "Low";
    let riskColor = "var(--status-positive)";

    if (simulated.status === 'CRITICAL_BELOW_BUFFER') {
        advice = "Transaction not viable. Buffer breached.";
        riskLevel = "Critical";
        riskColor = "var(--status-negative)";
    } else if (simulated.runwayDays < 30 && baseline.runwayDays >= 30) {
        advice = "Pushing into Danger Zone (<30 days).";
        riskLevel = "High";
        riskColor = "var(--status-negative)";
    } else if (daysLost > 30) {
        advice = `Large impact: -${Math.round(daysLost)} days runway.`;
        riskLevel = "Medium";
        riskColor = "#FF9F0A";
    } else if (daysLost > 0) {
        advice = `Minor impact: -${Math.round(daysLost)} days runway.`;
    }

    return {
        baseline,
        simulated,
        delta: {
            cost: totalSimCost,
            daysLost: daysLost
        },
        analysis: {
            advice,
            riskLevel,
            riskColor
        }
    };
};

export { simulateScenario };