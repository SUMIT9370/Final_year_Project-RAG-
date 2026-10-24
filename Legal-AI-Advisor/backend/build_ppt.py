import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Output directory for images and PPTX
out_dir = r"C:\Users\BusinessComputers.in\.gemini\antigravity\brain\abf41b5b-ef64-4ec3-be85-5e5319700533"
os.makedirs(out_dir, exist_ok=True)

# 1. Generate Diagram 1: Data Privacy & Property Damage
fig, ax = plt.subplots(figsize=(8, 4.5), facecolor='#020617')
ax.set_facecolor('#020617')
ax.axis('off')

# Left box - Bad Public AI
rect1 = patches.FancyBboxPatch((0.05, 0.2), 0.38, 0.65, boxstyle="round,pad=0.05", fc='#1e1b4b', ec='#ef4444', lw=2)
ax.add_patch(rect1)
ax.text(0.24, 0.72, "❌ Naive Cloud AI Usage", color='#f87171', fontsize=12, fontweight='bold', ha='center')
ax.text(0.24, 0.52, "• Exposes Internal Contracts\n• Risk of Data Theft & Leaks\n• Irreversible Property Damage\n• Compliance Violations", color='#e2e8f0', fontsize=9, ha='center', va='center')

# Right box - Secure RAG
rect2 = patches.FancyBboxPatch((0.57, 0.2), 0.38, 0.65, boxstyle="round,pad=0.05", fc='#064e3b', ec='#10b981', lw=2)
ax.add_patch(rect2)
ax.text(0.76, 0.72, "🛡️ Enterprise RAG Security", color='#34d399', fontsize=12, fontweight='bold', ha='center')
ax.text(0.76, 0.52, "• Proprietary Files Stay Local\n• Zero Model Re-Training\n• Encrypted Vector Index\n• Full Enterprise Compliance", color='#e2e8f0', fontsize=9, ha='center', va='center')

diag1_path = os.path.join(out_dir, "diag1_privacy.png")
plt.tight_layout()
plt.savefig(diag1_path, dpi=200, bbox_inches='tight', facecolor='#020617')
plt.close()

# 2. Generate Diagram 2: Token Cost & 1M Records Bottleneck
fig, ax = plt.subplots(figsize=(8, 4.5), facecolor='#020617')
ax.set_facecolor('#020617')

categories = ['Direct Prompting (1M Records)', 'RAG Vector Chunking']
costs = [100, 4.2] # Arbitrary scaling for token cost comparison
bars = ax.bar(categories, costs, color=['#ef4444', '#fbbf24'], width=0.4)

ax.set_title('Token Cost & Context Window Comparison (%)', color='#fbbf24', fontsize=13, fontweight='bold', pad=15)
ax.set_ylabel('Relative Token Cost / Payload Size', color='#cbd5e1', fontsize=10)
ax.tick_params(colors='#cbd5e1', labelsize=9)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#334155')
ax.spines['bottom'].set_color('#334155')

for bar in bars:
    yval = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2.0, yval + 2, f"{yval:.1f}%", ha='center', va='bottom', color='#f8fafc', fontweight='bold', fontsize=10)

diag2_path = os.path.join(out_dir, "diag2_token.png")
plt.tight_layout()
plt.savefig(diag2_path, dpi=200, bbox_inches='tight', facecolor='#020617')
plt.close()

# 3. Generate Diagram 3: RAG Core Flow
fig, ax = plt.subplots(figsize=(9, 4.5), facecolor='#020617')
ax.set_facecolor('#020617')
ax.axis('off')

steps = ["1. Ingest Docs\n& Images", "2. Local Vector\nFAISS Index", "3. Retrieve Top-K\nExact Chunks", "4. Groq LPU\nLLM Reasoning"]
colors = ['#38bdf8', '#818cf8', '#fbbf24', '#34d399']

for i, (step, col) in enumerate(zip(steps, colors)):
    x = 0.08 + i * 0.23
    rect = patches.FancyBboxPatch((x, 0.35), 0.18, 0.4, boxstyle="round,pad=0.03", fc='#0f172a', ec=col, lw=2.5)
    ax.add_patch(rect)
    ax.text(x + 0.09, 0.55, step, color='#f8fafc', fontsize=10, fontweight='bold', ha='center', va='center')
    if i < 3:
        ax.annotate('', xy=(x + 0.22, 0.55), xytext=(x + 0.18, 0.55),
                    arrowprops=dict(arrowstyle="->", color='#94a3b8', lw=2))

ax.text(0.5, 0.15, "🎯 Purpose: Zero AI Hallucination + 95% Token Savings", color='#fbbf24', fontsize=11, fontweight='bold', ha='center')

diag3_path = os.path.join(out_dir, "diag3_flow.png")
plt.tight_layout()
plt.savefig(diag3_path, dpi=200, bbox_inches='tight', facecolor='#020617')
plt.close()

print("Diagram images generated successfully!")
