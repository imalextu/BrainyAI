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

class ChatGPT4OAuthSingleton {
    private static instance: ChatGPT4OAuthSingleton;
    auth: OpenAIAuth;
    private apiKey: string = ""; // 在这里写死API Key
    private useApiKey: boolean = false; // 控制是否使用API Key

    protected constructor() {
        // ignore
    }

    static getInstance(): ChatGPT4OAuthSingleton {
        if (!ChatGPT4OAuthSingleton.instance) {
            ChatGPT4OAuthSingleton.instance = new ChatGPT4OAuthSingleton();
            ChatGPT4OAuthSingleton.instance.auth = new OpenAIAuth();
        }

        return ChatGPT4OAuthSingleton.instance;
    }
    
    getApiKey(): string {
        return this.apiKey;
    }
    
    isUsingApiKey(): boolean {
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

const modelSlug = "gpt-4o";

export default class ChatGPT4O extends OpenaiBot {
    static botName = 'GPT-4o';
    model = modelSlug;
    static requireLogin = true;
    static maxTokenLimit = 32 * 1000;
    static desc = 'Suitable for complex problem-solving and visual content analysis.';
    supportedUploadTypes = [BotSupportedMimeType.ANY];

    static async checkModelCanUse() {
        // 如果使用API Key，则直接返回true，假设API Key有权限访问该模型
        Logger.log("ChatGPT4OAuthSingleton.getInstance().isUsingApiKey111()", ChatGPT4OAuthSingleton.getInstance().isUsingApiKey());
        if (ChatGPT4OAuthSingleton.getInstance().isUsingApiKey()) {
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
        if (ChatGPT4OAuthSingleton.getInstance().isUsingApiKey()) {
            // 直接调用父类方法，由其内部处理API Key逻辑
            // return super.completion({prompt, rid, cb, fileRef});
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
        const apiKey = ChatGPT4OAuthSingleton.getInstance().getApiKey();
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

        try {
            // 构建包含历史消息的数组
            const messages = this.buildMessagesWithHistory(prompt);

            Logger.log("messages111", messages);
            
            // 调用OpenAI官方API
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: messages,
                    stream: true
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                return cb(rid, new ConversationResponse({
                    conversation_id: this.botSession.session.botConversationId,
                    parent_message_id: this.botSession.session.getParentMessageId(),
                    message_type: ResponseMessageType.ERROR,
                    error: new ChatError(ErrorCode.MODEL_INTERNAL_ERROR, JSON.stringify(errorData))
                }));
            }
            
            // 处理流式响应
            const reader = response.body!.getReader();
            const decoder = new TextDecoder("utf-8");
            let messageId = createUuid();
            let fullText = "";
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        
                        if (data === '[DONE]') {
                            // 完成
                            cb(rid, new ConversationResponse({
                                conversation_id: this.botSession.session.botConversationId,
                                message_id: messageId,
                                message_type: ResponseMessageType.DONE
                            }));
                            
                            // 保存消息
                            this.botSession.session.addMessage(new SimpleBotMessage(fullText, messageId));
                            break;
                        }
                        
                        try {
                            const parsedData = JSON.parse(data);
                            if (parsedData.choices && parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
                                const content = parsedData.choices[0].delta.content;
                                fullText += content;
                                
                                cb(rid, new ConversationResponse({
                                    message_type: ResponseMessageType.GENERATING,
                                    conversation_id: this.botSession.session.botConversationId,
                                    message_id: messageId,
                                    message_text: fullText
                                }));
                            }
                        } catch (e) {
                            Logger.log('Error parsing stream data:', e);
                        }
                    }
                }
            }
            
        } catch (error) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                parent_message_id: this.botSession.session.getParentMessageId(),
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.UNKNOWN_ERROR, error.toString())
            }));
        }
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
