import React, {useState} from 'react';
import {Button, Switch} from "antd";
import {useStorage} from "@plasmohq/storage/dist/hook";

export default function ApiKeyPage() {
    const [apiKey, setApiKey] = useStorage('apiKey', '');
    const [useApiKey, setUseApiKey] = useStorage('useApiKey', false);
    const [inputApiKey, setInputApiKey] = useState(apiKey);

    const handleSave = () => {
        void setApiKey(inputApiKey);
    };

    const handleUseApiKeyChange = (checked: boolean) => {
        void setUseApiKey(checked);
    };

    return (
        <div>
            <div className={'bg-white shadow-[0_4px_12px_0px_rgba(0,0,0,.2)] overflow-hidden rounded-tl-[24px] rounded-tr-[24px] px-[56px] py-[32px] mt-[32px] flex flex-col'}>
                <div className={'text-[#333333] font-[700] text-[20px] justify-start'}>API Key设置</div>
                <div className={'text-[#5E5E5E] font-[400] text-[12px] justify-start mt-[8px]'}>
                    配置OpenAI API密钥，启用后将使用您的API密钥访问OpenAI服务。
                </div>
                
                <div className={'mt-[32px]'}>
                    <div className={'flex flex-row items-center'}>
                        <div className={'font-[600] text-[16px] text-[#333333] w-[120px]'}>启用API Key</div>
                        <Switch checked={useApiKey} onChange={handleUseApiKeyChange} />
                    </div>
                    
                    <div className={'flex flex-row items-center mt-[24px]'}>
                        <div className={'font-[600] text-[16px] text-[#333333] w-[120px]'}>API Key</div>
                        <input
                            value={inputApiKey}
                            onChange={(e) => setInputApiKey(e.target.value)}
                            className={'h-[40px] rounded-[8px] border-[1px] border-[#D9D9D9] px-[16px] w-[520px]'}
                            placeholder={'请输入您的OpenAI API Key'}
                            disabled={!useApiKey}
                        />
                    </div>
                    
                    <div className={'flex justify-start mt-[32px]'}>
                        <Button 
                            onClick={handleSave} 
                            type="primary" 
                            className={'bg-[#0A4DFE] h-[40px] w-[120px]'}
                            disabled={!useApiKey}
                        >
                            保存
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}