import {OpenaiBot} from "~libs/chatbot/openai/index";
import {OpenAIAuth} from "~libs/open-ai/open-ai-auth";
import {BotSession} from "~libs/chatbot/BotSessionBase";
import type {BotCompletionParams, BotConstructorParams} from "~libs/chatbot/IBot";
import {ConversationResponse, ResponseMessageType} from "~libs/open-ai/open-ai-interface";
import {ChatError, ErrorCode} from "~utils/errors";
import {Logger} from "~utils/logger";
import {BotSupportedMimeType} from "~libs/chatbot/BotBase";
import {OpenAiFileRef} from "~libs/chatbot/openai/fileInstance";
import {createUuid} from "~utils/index";
import {SimpleBotMessage} from "~libs/chatbot/BotSessionBase";
import {Storage} from "@plasmohq/storage";

class ChatGPT4OAuthSingleton {
    private static instance: ChatGPT4OAuthSingleton;
    auth: OpenAIAuth;
    private storage = new Storage();
    private apiKey: string = "";
    private useApiKey: boolean = false;

    constructor() {
        this.initializeSettings();
    }

    private async initializeSettings() {
        this.apiKey = await this.storage.get("apiKey") || "";
        this.useApiKey = await this.storage.get("useApiKey") || false;

        console.log("this.apiKey11133", this.apiKey);
        console.log("this.useApiKey11133", this.useApiKey);
        
        if (!this.useApiKey || !this.apiKey) {
            this.apiKey = process.env.OPENAI_API_KEY || "";
            this.useApiKey = !!process.env.OPENAI_API_KEY;
        }
    }

    // 添加方法，重新加载设置
    public async reloadSettings() {
        await this.initializeSettings();
    }

    static getInstance(): ChatGPT4OAuthSingleton {
        if (!ChatGPT4OAuthSingleton.instance) {
            ChatGPT4OAuthSingleton.instance = new ChatGPT4OAuthSingleton();
            ChatGPT4OAuthSingleton.instance.auth = new OpenAIAuth();
        }

        return ChatGPT4OAuthSingleton.instance;
    }
    
    async getApiKey(): Promise<string> {
        await this.reloadSettings();
        return this.apiKey;
    }
    
    async isUsingApiKey(): Promise<boolean> {
        await this.reloadSettings();
        return this.useApiKey;
    }
}

class ChatGPT4OSessionSingleton {
    private static instance: ChatGPT4OSessionSingleton | null;
    static globalConversationId: string;
    session: BotSession;

    private constructor() {
        this.session = new BotSession(ChatGPT4OSessionSingleton.globalConversationId);
    }

    static destroy() {
        ChatGPT4OSessionSingleton.globalConversationId = "";
        ChatGPT4OSessionSingleton.instance = null;
    }

    static getInstance(globalConversationId: string) {
        if (globalConversationId !== ChatGPT4OSessionSingleton.globalConversationId) {
            ChatGPT4OSessionSingleton.destroy();
        }

        ChatGPT4OSessionSingleton.globalConversationId = globalConversationId;

        if (!ChatGPT4OSessionSingleton.instance) {
            ChatGPT4OSessionSingleton.instance = new ChatGPT4OSessionSingleton();
        }

        return ChatGPT4OSessionSingleton.instance;
    }
}

// 图片生成任务状态
enum ImageGenerationStatus {
    GENERATING = "GENERATING",
    SUCCESS = "SUCCESS",
    CREATE_TASK_FAILED = "CREATE_TASK_FAILED",
    GENERATE_FAILED = "GENERATE_FAILED"
}

// 图片生成响应接口
interface ImageGenerationResponse {
    code: number;
    msg: string;
    data: {
        taskId?: string;
        imageUrls?: string[];
        status?: ImageGenerationStatus;
    };
}

const modelSlug = "gpt-4o";

export default class ChatGPT4O extends OpenaiBot {
    static botName = 'GPT-4o';
    model = modelSlug;
    static requireLogin = true;
    static maxTokenLimit = 32 * 1000;
    static desc = 'Suitable for complex problem-solving and visual content analysis.';
    supportedUploadTypes = [BotSupportedMimeType.ANY];
    private imageApiBase = "https://kieai.erweima.ai/api/v1";

    static async checkModelCanUse() {
        // 如果使用API Key，则直接返回true，假设API Key有权限访问该模型


        Logger.log("process.env.OPENAI_API_KEY111", process.env.OPENAI_API_KEY);
        Logger.log("ChatGPT4OAuthSingleton.getInstance().isUsingApiKey111()", await ChatGPT4OAuthSingleton.getInstance().isUsingApiKey());
        if (await ChatGPT4OAuthSingleton.getInstance().isUsingApiKey()) {
            return true;
        }
        
        const modelInfo = await this.modelInfo.getModelInfo();
        Logger.log("modelInfo111", modelInfo);
        if(!modelInfo) return false;

        return modelInfo.models.map(item => item.slug).includes(modelSlug) ?? false;
    }

    constructor(params: BotConstructorParams) {
        super(params);
        this.botSession = ChatGPT4OSessionSingleton.getInstance(params.globalConversationId);
        this.authInstance = ChatGPT4OAuthSingleton.getInstance();
    }

    async completion({prompt, rid, cb, fileRef}: BotCompletionParams): Promise<void> {
        // 如果使用API Key，直接调用super.completion方法
        if (await ChatGPT4OAuthSingleton.getInstance().isUsingApiKey()) {
            // 直接调用父类方法，由其内部处理API Key逻辑
            // return super.completion({prompt, rid, cb, fileRef});
            // console.log("使用API Key");
            return this.apiKeyCompletion({prompt, rid, cb, fileRef});
        }
        
        // 否则使用原有的登录方式调用
        const [checkErr, isLogin] = await ChatGPT4O.checkIsLogin();

        if(checkErr || !isLogin) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: checkErr ?? new ChatError(ErrorCode.UNAUTHORIZED)
            }));
        }

        if(!await ChatGPT4O.checkModelCanUse()) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.MODEL_NO_PERMISSION)
            }));
        }

        return super.completion({prompt, rid, cb, fileRef});
    }

    // 添加使用API Key调用OpenAI接口的方法
    private async apiKeyCompletion({prompt, rid, cb, fileRef}: BotCompletionParams): Promise<void> {
        const apiKey = await ChatGPT4OAuthSingleton.getInstance().getApiKey();
        let ref: OpenAiFileRef | null = null;
        
        if (fileRef) {
            const refObj = this.fileInstance.getRefs(fileRef);
            if (!refObj || refObj.err) {
                return cb(rid, new ConversationResponse({
                    error: refObj?.err ?? new ChatError(ErrorCode.UNKNOWN_ERROR),
                    message_type: ResponseMessageType.ERROR
                }));
            }
            ref = refObj!.ref;
        }
        
        Logger.log("apiKey111", apiKey);

        if (!apiKey) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.UNAUTHORIZED, "API密钥未提供")
            }));
        }

        try {
            // 构建包含历史消息的数组
            const messages = this.buildMessagesWithHistory(prompt);
            Logger.log("messages111", messages);
            
            // 通知用户开始生成回复
            const messageId = createUuid();
            cb(rid, new ConversationResponse({
                message_type: ResponseMessageType.GENERATING,
                conversation_id: this.botSession.session.botConversationId,
                message_id: messageId,
                message_text: "正在生成回复，请稍候..."
            }));

            // 构建请求头和请求体
            const myHeaders = new Headers();
            myHeaders.append("Content-Type", "application/json");
            myHeaders.append("Accept", "application/json");
            myHeaders.append("Authorization", `Bearer ${apiKey}`);

            const requestBody = {
                prompt: prompt,
                size: "1:1"
            };

            if (messages && messages.length > 0) {
                requestBody["messageHistory"] = messages;
            }

            const requestOptions = {
                method: "POST",
                headers: myHeaders,
                body: JSON.stringify(requestBody),
                redirect: "follow" as RequestRedirect
            };

            // 发送聊天完成请求
            const response = await fetch(`${this.imageApiBase}/gpt4o-image/generate`, requestOptions);
            
            if (!response.ok) {
                const errorData = await response.json();
                return cb(rid, new ConversationResponse({
                    conversation_id: this.botSession.session.botConversationId,
                    parent_message_id: this.botSession.session.getParentMessageId(),
                    message_type: ResponseMessageType.ERROR,
                    error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, JSON.stringify(errorData))
                }));
            }

            const result = await response.json();
            
            if (result.code !== 200 || !result.data.taskId) {
                return cb(rid, new ConversationResponse({
                    conversation_id: this.botSession.session.botConversationId,
                    parent_message_id: this.botSession.session.getParentMessageId(),
                    message_type: ResponseMessageType.ERROR,
                    error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, result.msg || "创建聊天任务失败")
                }));
            }

            // 获取任务ID
            const taskId = result.data.taskId;
            
            // 开始轮询任务状态
            await this.pollChatCompletionStatus(taskId, rid, cb, messageId);
            
        } catch (error) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.UNKNOWN_ERROR, error.toString())
            }));
        }
    }

    // 轮询聊天完成状态
    private async pollChatCompletionStatus(taskId: string, rid: string, cb: Function, messageId: string): Promise<void> {
        const apiKey = await ChatGPT4OAuthSingleton.getInstance().getApiKey();
        const MAX_RETRIES = 3000; // 最多轮询30次
        const POLL_INTERVAL = 2000; // 每2秒轮询一次
        
        const myHeaders = new Headers();
        myHeaders.append("Accept", "application/json");
        myHeaders.append("Authorization", `Bearer ${apiKey}`);

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow" as RequestRedirect
        };

        let fullText = "";

        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                // 等待一段时间再查询
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                }

                const response = await fetch(`${this.imageApiBase}/gpt4o-image/record-info?taskId=${taskId}`, requestOptions);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    Logger.log('Error polling chat status:', errorData);
                    continue; // 继续轮询
                }

                const result = await response.json();
                Logger.log('Poll result:', result);
                
                // 检查任务状态
                if (result.code === 200 && result.data.status) {
                    switch (result.data.status) {
                        case "SUCCESS":
                            // 生成成功，首先检查是否有图片结果
                            if (result.data.response && result.data.response.resultUrls && result.data.response.resultUrls.length > 0) {
                                // 如果有图片结果，构建Markdown消息展示图片
                                let imageMarkdown = "### 图片生成结果\n\n";
                                result.data.response.resultUrls.forEach((url, index) => {
                                    imageMarkdown += `![图片${index + 1}](${url})\n\n`;
                                });
                                
                                // 发送生成完成的消息
                                cb(rid, new ConversationResponse({
                                    message_type: ResponseMessageType.GENERATING,
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_text: imageMarkdown
                                }));
                                
                                // 发送完成信号
                                cb(rid, new ConversationResponse({
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_type: ResponseMessageType.DONE
                                }));
                                
                                // 保存消息
                                this.botSession.session.addMessage(new SimpleBotMessage(imageMarkdown, messageId));
                                return;
                            } 
                            // 如果没有图片，检查是否有文本内容
                            else if (result.data.content) {
                                fullText = result.data.content;
                                
                                // 发送生成完成的消息
                                cb(rid, new ConversationResponse({
                                    message_type: ResponseMessageType.GENERATING,
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_text: fullText
                                }));
                                
                                // 发送完成信号
                                cb(rid, new ConversationResponse({
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_type: ResponseMessageType.DONE
                                }));
                                
                                // 保存消息
                                this.botSession.session.addMessage(new SimpleBotMessage(fullText, messageId));
                                return;
                            }
                            break;
                            
                        case "GENERATING":
                            // 仍在生成中，如果有部分内容则更新
                            if (result.data.partialContent && result.data.partialContent !== fullText) {
                                fullText = result.data.partialContent;
                                cb(rid, new ConversationResponse({
                                    message_type: ResponseMessageType.GENERATING,
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_text: fullText
                                }));
                            } else {
                                cb(rid, new ConversationResponse({
                                    message_type: ResponseMessageType.GENERATING,
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_text: fullText || `正在生成回复，请稍候...(${i + 1}/${MAX_RETRIES})`
                                }));
                            }
                            break;
                            
                        case "CREATE_TASK_FAILED":
                        case "GENERATE_FAILED":
                            // 生成失败
                            return cb(rid, new ConversationResponse({
                                conversation_id: this.botSession.session.botConversationId,
                                parent_message_id: this.botSession.session.getParentMessageId(),
                                message_type: ResponseMessageType.ERROR,
                                error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, `回复生成失败: ${result.msg || result.data.status}`)
                            }));
                    }
                }
            } catch (error) {
                Logger.log('Error in polling:', error);
                // 出错了但继续轮询
            }
        }
        
        // 超过最大重试次数，认为生成失败
        return cb(rid, new ConversationResponse({
            conversation_id: this.botSession.session.botConversationId,
            parent_message_id: this.botSession.session.getParentMessageId(),
            message_type: ResponseMessageType.ERROR,
            error: new ChatError(ErrorCode.REQUEST_TIMEOUT_ABORT, "回复生成超时，请稍后再试")
        }));
    }

    // 新增方法：生成图片
    async generateImage({ prompt, fileUrls, size, rid, cb }: { 
        prompt?: string, 
        fileUrls?: string[], 
        size: string, 
        rid: string, 
        cb: Function 
    }): Promise<void> {
        const apiKey = await ChatGPT4OAuthSingleton.getInstance().getApiKey();
        console.log("apiKey1112", apiKey);
        
        if (!apiKey) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.UNAUTHORIZED, "API密钥未提供")
            }));
        }

        if (!prompt && (!fileUrls || fileUrls.length === 0)) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.UNKNOWN_ERROR, "需要提供提示词或图片URL")
            }));
        }

        try {
            // 通知用户开始生成图片
            const messageId = createUuid();
            cb(rid, new ConversationResponse({
                message_type: ResponseMessageType.GENERATING,
                conversation_id: this.botSession.session.botConversationId,
                message_id: messageId,
                message_text: "正在生成图片，请稍候..."
            }));

            // 构建请求头和请求体
            const myHeaders = new Headers();
            myHeaders.append("Content-Type", "application/json");
            myHeaders.append("Accept", "application/json");
            myHeaders.append("Authorization", `Bearer ${apiKey}`);

            const requestBody: any = {
                size: size || "1:1" // 默认为1:1
            };

            if (prompt) {
                requestBody.prompt = prompt;
            }

            if (fileUrls && fileUrls.length > 0) {
                requestBody.filesUrl = fileUrls;
            }

            const requestOptions = {
                method: "POST",
                headers: myHeaders,
                body: JSON.stringify(requestBody),
                redirect: "follow" as RequestRedirect
            };

            // 发送图片生成请求
            const response = await fetch(`${this.imageApiBase}/gpt4o-image/generate`, requestOptions);
            
            if (!response.ok) {
                const errorData = await response.json();
                return cb(rid, new ConversationResponse({
                    conversation_id: this.botSession.session.botConversationId,
                    parent_message_id: this.botSession.session.getParentMessageId(),
                    message_type: ResponseMessageType.ERROR,
                    error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, JSON.stringify(errorData))
                }));
            }

            const result = await response.json() as ImageGenerationResponse;
            
            if (result.code !== 200 || !result.data.taskId) {
                return cb(rid, new ConversationResponse({
                    conversation_id: this.botSession.session.botConversationId,
                    parent_message_id: this.botSession.session.getParentMessageId(),
                    message_type: ResponseMessageType.ERROR,
                    error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, result.msg || "创建图片任务失败")
                }));
            }

            // 获取任务ID
            const taskId = result.data.taskId;
            
            // 开始轮询任务状态
            await this.pollImageGenerationStatus(taskId, rid, cb, messageId);
            
        } catch (error) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.UNKNOWN_ERROR, error.toString())
            }));
        }
    }

    // 轮询图片生成状态
    private async pollImageGenerationStatus(taskId: string, rid: string, cb: Function, messageId: string): Promise<void> {
        const apiKey = await ChatGPT4OAuthSingleton.getInstance().getApiKey();
        const MAX_RETRIES = 30; // 最多轮询30次
        const POLL_INTERVAL = 3000; // 每3秒轮询一次
        
        const myHeaders = new Headers();
        myHeaders.append("Accept", "application/json");
        myHeaders.append("Authorization", `Bearer ${apiKey}`);

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow" as RequestRedirect
        };

        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                // 等待一段时间再查询
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                }

                const response = await fetch(`${this.imageApiBase}/gpt4o-image/record-info?taskId=${taskId}`, requestOptions);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    Logger.log('Error polling image status:', errorData);
                    continue; // 继续轮询
                }

                const result = await response.json() as ImageGenerationResponse;
                
                // 检查任务状态
                if (result.code === 200 && result.data.status) {
                    switch (result.data.status) {
                        case ImageGenerationStatus.SUCCESS:
                            // 生成成功，返回图片URL
                            if (result.data.imageUrls && result.data.imageUrls.length > 0) {
                                // 构建包含图片的Markdown消息
                                let imageMarkdown = "### 图片生成结果\n\n";
                                result.data.imageUrls.forEach((url, index) => {
                                    imageMarkdown += `![图片${index + 1}](${url})\n\n`;
                                });
                                
                                // 发送生成完成的消息
                                cb(rid, new ConversationResponse({
                                    message_type: ResponseMessageType.GENERATING,
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_text: imageMarkdown
                                }));
                                
                                // 发送完成信号
                                cb(rid, new ConversationResponse({
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_type: ResponseMessageType.DONE
                                }));
                                
                                // 保存消息
                                this.botSession.session.addMessage(new SimpleBotMessage(imageMarkdown, messageId));
                                return;
                            }
                            break;
                            
                        case ImageGenerationStatus.GENERATING:
                            // 仍在生成中，更新进度消息
                            cb(rid, new ConversationResponse({
                                message_type: ResponseMessageType.GENERATING,
                                conversation_id: this.botSession.session.botConversationId,
                                message_id: messageId,
                                message_text: `正在生成图片，请稍候...(${i + 1}/${MAX_RETRIES})`
                            }));
                            break;
                            
                        case ImageGenerationStatus.CREATE_TASK_FAILED:
                        case ImageGenerationStatus.GENERATE_FAILED:
                            // 生成失败
                            return cb(rid, new ConversationResponse({
                                conversation_id: this.botSession.session.botConversationId,
                                parent_message_id: this.botSession.session.getParentMessageId(),
                                message_type: ResponseMessageType.ERROR,
                                error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, `图片生成失败: ${result.msg || result.data.status}`)
                            }));
                    }
                }
            } catch (error) {
                Logger.log('Error in polling:', error);
                // 出错了但继续轮询
            }
        }
        
        // 超过最大重试次数，认为生成失败
        return cb(rid, new ConversationResponse({
            conversation_id: this.botSession.session.botConversationId,
            parent_message_id: this.botSession.session.getParentMessageId(),
            message_type: ResponseMessageType.ERROR,
            error: new ChatError(ErrorCode.REQUEST_TIMEOUT_ABORT, "图片生成超时，请稍后再试")
        }));
    }

    // 新增方法：构建包含历史消息的数组
    private buildMessagesWithHistory(currentPrompt: string): Array<{role: string, content: string}> {
        const messages: Array<{role: string, content: string}> = [];
        
        // 从会话记录中获取历史消息
        const sessionMessages = this.botSession.session.messages;

        Logger.log("sessionMessages111", sessionMessages);
        
        // 按顺序添加历史消息，通常是交替的用户和助手消息
        if (sessionMessages && sessionMessages.length > 0) {
            let isUserMessage = true; // 假设第一条消息是用户发送的
            
            for (const message of sessionMessages) {
                messages.push({
                    role: isUserMessage ? "user" : "assistant",
                    content: message.text
                });
                
                isUserMessage = !isUserMessage; // 切换角色
            }
        }
        
        // 添加当前用户提示
        messages.push({
            role: "user",
            content: currentPrompt
        });

        let messageId = createUuid();
        this.botSession.session.addMessage(new SimpleBotMessage(currentPrompt, messageId));
        
        Logger.log("完整消息历史", messages);
        return messages;
    }

    getBotName(): string {
        return ChatGPT4O.botName;
    }

    getRequireLogin(): boolean {
        return ChatGPT4O.requireLogin;
    }

    uploadFile(file: File): Promise<string> {
        return this.fileInstance.uploadFile(file, this.supportedUploadTypes);
    }

    getMaxTokenLimit(): number {
        return ChatGPT4O.maxTokenLimit;
    }
}
