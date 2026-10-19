"""
AI Company v4 - Streamlit 专业监控界面 (固定高度布局)
"""

import streamlit as st
import requests
from datetime import datetime

# 页面配置
st.set_page_config(
    page_title="AI Company v4 - DeepAgent Monitor",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# API 配置
API_URL = "http://localhost:3000/api"

# 自定义 CSS - 固定高度布局
st.markdown("""
<style>
    /* 隐藏 Streamlit 默认的顶部 padding */
    .block-container {
        padding-top: 1rem;
        padding-bottom: 1rem;
        max-width: 100%;
    }

    /* 固定高度滚动容器 */
    .scrollable-container {
        height: 400px;
        overflow-y: auto;
        overflow-x: hidden;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 12px;
        background: #0f172a;
    }

    .scrollable-container::-webkit-scrollbar {
        width: 8px;
    }

    .scrollable-container::-webkit-scrollbar-track {
        background: #1e293b;
        border-radius: 4px;
    }

    .scrollable-container::-webkit-scrollbar-thumb {
        background: #475569;
        border-radius: 4px;
    }

    .scrollable-container::-webkit-scrollbar-thumb:hover {
        background: #64748b;
    }

    /* 聊天容器 */
    .chat-container {
        height: 500px;
        overflow-y: auto;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 16px;
        background: #0f172a;
    }

    /* 追踪容器 */
    .trace-container {
        height: 350px;
        overflow-y: auto;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 12px;
        background: #0f172a;
    }

    /* Agent 卡片 */
    .agent-card {
        background: #1e293b;
        border-radius: 8px;
        padding: 12px;
        margin: 4px 0;
        border-left: 3px solid #10b981;
        transition: all 0.2s;
    }

    .agent-card:hover {
        background: #334155;
        transform: translateX(4px);
    }

    /* 状态指示灯 */
    .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    /* 顶部标题 */
    .main-header {
        font-size: 1.8rem;
        font-weight: bold;
        background: linear-gradient(90deg, #3b82f6, #8b5cf6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
        padding: 0.5rem 0;
    }

    /* 聊天消息样式 */
    .chat-message-user {
        background: #3b82f6;
        color: white;
        padding: 10px 14px;
        border-radius: 12px 12px 4px 12px;
        margin: 8px 0;
        max-width: 80%;
        margin-left: auto;
    }

    .chat-message-assistant {
        background: #1e293b;
        color: #e2e8f0;
        padding: 10px 14px;
        border-radius: 12px 12px 12px 4px;
        margin: 8px 0;
        max-width: 80%;
    }

    /* 追踪项 */
    .trace-item {
        background: #1e293b;
        border-radius: 6px;
        padding: 10px;
        margin: 6px 0;
        border-left: 3px solid #3b82f6;
    }

    /* 日志容器 */
    .log-container {
        height: 150px;
        overflow-y: auto;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 10px;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 11px;
        line-height: 1.4;
    }
</style>
""", unsafe_allow_html=True)

# 会话状态初始化
if "messages" not in st.session_state:
    st.session_state.messages = []
if "trace_history" not in st.session_state:
    st.session_state.trace_history = []

# 标题行 - 固定高度
header_col1, header_col2, header_col3 = st.columns([3, 1, 1])
with header_col1:
    st.markdown('<h1 class="main-header">🤖 AI Company v4</h1>', unsafe_allow_html=True)
with header_col2:
    st.markdown(f"<div style='text-align: right; padding: 0.5rem;'>🟢 运行中</div>", unsafe_allow_html=True)
with header_col3:
    st.markdown(f"<div style='text-align: right; padding: 0.5rem;'>🤖 6 Agents</div>", unsafe_allow_html=True)

# 侧边栏 - 系统状态
with st.sidebar:
    st.markdown("## 📊 系统状态")

    metrics_col1, metrics_col2 = st.columns(2)
    with metrics_col1:
        st.metric("状态", "🟢 运行")
    with metrics_col2:
        st.metric("Agents", "6")

    st.divider()

    st.markdown("## 👥 Agent 团队")

    # CEO Agent
    st.markdown("""
    <div class="agent-card">
        <strong>🎯 CEO Agent</strong><br>
        <small style="color: #94a3b8;">战略决策 | <span class="status-dot"></span> 就绪</small>
    </div>
    """, unsafe_allow_html=True)

    # Manager Agent
    st.markdown("""
    <div class="agent-card">
        <strong>📋 Manager Agent</strong><br>
        <small style="color: #94a3b8;">任务协调 | <span class="status-dot"></span> 就绪</small>
    </div>
    """, unsafe_allow_html=True)

    # Specialists
    st.markdown("#### 专家团队")

    specialists = [
        ("🔍 Researcher", "新闻搜索"),
        ("✍️ Creator", "内容创作"),
        ("📤 Publisher", "小红书发布"),
        ("📊 Analyst", "数据分析"),
    ]

    for name, specialty in specialists:
        st.markdown(f"""
        <div style="background: #334155; border-radius: 6px; padding: 8px; margin: 4px 0;">
            <small><strong>{name}</strong></small><br>
            <small style="color: #94a3b8;">{specialty}</small>
            <span style="float: right;" class="status-dot"></span>
        </div>
        """, unsafe_allow_html=True)

    st.divider()
    st.markdown("### 🔗 快速链接")
    st.markdown("- [API Health](http://localhost:3000/api/health)")

# 主内容区 - 固定高度两列布局
main_col1, main_col2 = st.columns([3, 2])

with main_col1:
    st.markdown("### 💬 与 CEO 对话")

    # 聊天输入（顶部）
    with st.container():
        col_input, col_send = st.columns([4, 1])
        with col_input:
            user_input = st.text_input("", placeholder="输入你的需求...", label_visibility="collapsed", key="chat_input")
        with col_send:
            send_clicked = st.button("发送", use_container_width=True)

    # 聊天历史容器（固定高度）
    chat_html = '<div class="chat-container">'

    if st.session_state.messages:
        for msg in st.session_state.messages:
            if msg["role"] == "user":
                chat_html += f'<div class="chat-message-user">{msg["content"]}</div>'
            else:
                chat_html += f'<div class="chat-message-assistant">{msg["content"]}</div>'
    else:
        chat_html += '<div style="color: #64748b; text-align: center; padding: 20px;">开始对话，CEO 随时准备为你服务</div>'

    chat_html += '</div>'
    st.markdown(chat_html, unsafe_allow_html=True)

with main_col2:
    st.markdown("### 📊 执行追踪")

    # 追踪容器（固定高度）
    trace_html = '<div class="trace-container">'

    if st.session_state.trace_history:
        for trace in reversed(st.session_state.trace_history[-10:]):
            trace_html += f'''
            <div class="trace-item">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <small style="color: #3b82f6;">⏰ {trace['timestamp']}</small>
                </div>
                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;"><strong>{trace['task'][:40]}...</strong></div>
                <div style="font-size: 11px; color: #94a3b8;">{trace['response'][:60]}...</div>
            </div>
            '''
    else:
        trace_html += '<div style="color: #64748b; text-align: center; padding: 20px;">发送消息后显示执行追踪</div>'

    trace_html += '</div>'
    st.markdown(trace_html, unsafe_allow_html=True)

    # 统计信息
    stats_col1, stats_col2 = st.columns(2)
    with stats_col1:
        st.metric("今日任务", len(st.session_state.trace_history))
    with stats_col2:
        st.metric("成功率", "100%")

# 底部 - 系统日志（固定高度）
st.markdown("### 📝 系统日志")
logs_html = f'''
<div class="log-container">
<div style="color: #10b981;">[INFO] AI Company v4 running</div>
<div style="color: #94a3b8;">[INFO] WebSocket: ws://localhost:8081</div>
<div style="color: #94a3b8;">[INFO] REST API: http://localhost:3000</div>
<div style="color: #94a3b8;">[INFO] Agents: CEO, Manager, Researcher, Creator, Publisher, Analyst</div>
<div style="color: #10b981;">[INFO] ✅ All systems operational</div>
<div style="color: #64748b;">Current time: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</div>
</div>
'''
st.markdown(logs_html, unsafe_allow_html=True)

# 处理用户输入
if send_clicked and user_input.strip():
    # 添加用户消息
    st.session_state.messages.append({"role": "user", "content": user_input})

    # 调用 API
    try:
        response = requests.post(
            f"{API_URL}/conversations/main/messages",
            json={"content": user_input},
            timeout=30
        )

        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                ai_response = result.get("data", {}).get("response", "任务已接收")
            else:
                ai_response = f"错误：{result.get('error', {})}"
        else:
            ai_response = f"API 错误：{response.status_code}"

    except Exception as e:
        ai_response = f"连接失败：{str(e)}"

    # 添加助手响应
    st.session_state.messages.append({"role": "assistant", "content": ai_response})

    # 添加执行追踪
    st.session_state.trace_history.append({
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "task": user_input,
        "response": ai_response
    })

    # 刷新页面
    st.rerun()
