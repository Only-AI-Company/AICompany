"""
AI Company v4 - Chainlit 专业监控界面
"""

import chainlit as cl
import httpx
import json
from typing import Dict, Any

# 配置
API_URL = "http://localhost:3000/api"
WS_URL = "ws://localhost:8081"

@cl.on_chat_start
async def on_chat_start():
    """会话开始时初始化"""
    await cl.Message(
        content="""
# 🤖 AI Company v4

欢迎使用 AI 自主运行系统！

## 当前状态
- ✅ CEO Agent: 已就绪
- ✅ Manager Agent: 已就绪
- ✅ 4个 Specialist Agents: 已就绪
- ✅ Memory System: 已初始化
- ✅ Tool Registry: 5个工具已注册

## 开始使用
直接发送消息，我会：
1. 分析你的需求
2. 制定执行计划
3. 分配给合适的 Agent
4. 实时显示执行过程
5. 返回最终结果

发送任何内容开始测试！
        """,
        author="System"
    ).send()

    # 设置侧边栏
    await setup_sidebar()

async def setup_sidebar():
    """设置侧边栏信息"""
    elements = [
        cl.Text(name="system_status", content="🟢 系统运行中", display="inline"),
        cl.Text(name="agents", content="🤖 Agents: 6 个已激活", display="inline"),
        cl.Text(name="tools", content="🔧 Tools: 5 个已注册", display="inline"),
    ]
    await cl.Message(
        content="### 系统信息",
        elements=elements
    ).send()

@cl.on_message
async def on_message(message: cl.Message):
    """处理用户消息"""
    # 显示正在思考
    thinking_msg = cl.Message(content="🤔 正在思考...")
    await thinking_msg.send()

    try:
        # 调用后端 API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/conversations/main/messages",
                json={"content": message.content},
                timeout=60.0
            )
            response.raise_for_status()
            result = response.json()

        # 删除思考消息
        await thinking_msg.remove()

        if result.get("success"):
            data = result.get("data", {})

            # 显示响应
            if data.get("response"):
                await cl.Message(
                    content=data["response"],
                    author="Assistant"
                ).send()

            # 显示任务信息
            if data.get("taskId"):
                await cl.Message(
                    content=f"✅ 任务已创建: `{data['taskId']}`",
                    elements=[
                        cl.Text(
                            name="task_id",
                            content=data['taskId'],
                            display="side"
                        )
                    ]
                ).send()

            # 显示执行步骤（模拟，实际应该从 WebSocket 获取）
            await show_execution_steps(message.content)

        else:
            await cl.Message(
                content=f"❌ 错误: {result.get('error', {}).get('message', 'Unknown error')}",
                author="System"
            ).send()

    except Exception as e:
        await thinking_msg.remove()
        await cl.Message(
            content=f"❌ 系统错误: {str(e)}",
            author="System"
        ).send()

async def show_execution_steps(task: str):
    """显示执行步骤"""
    steps = [
        {"step": "1️⃣ 接收任务", "agent": "CEO", "status": "✅ 完成"},
        {"step": "2️⃣ 分析需求", "agent": "CEO", "status": "✅ 完成"},
        {"step": "3️⃣ 制定计划", "agent": "Manager", "status": "✅ 完成"},
        {"step": "4️⃣ 分配任务", "agent": "Manager", "status": "✅ 完成"},
        {"step": "5️⃣ 执行任务", "agent": "Specialist", "status": "🔄 执行中"},
        {"step": "6️⃣ 返回结果", "agent": "CEO", "status": "⏳ 等待中"},
    ]

    # 创建执行追踪
    trace_content = "### 📊 执行追踪\n\n"
    for step in steps:
        trace_content += f"{step['step']} - {step['agent']}: {step['status']}\n"

    await cl.Message(
        content=trace_content,
        author="System"
    ).send()

@cl.on_chat_end
async def on_chat_end():
    """会话结束时清理"""
    await cl.Message(
        content="👋 感谢使用 AI Company v4！",
        author="System"
    ).send()

# 启动 Chainlit
if __name__ == "__main__":
    import chainlit
    chainlit.cli()
