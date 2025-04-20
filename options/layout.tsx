import {Outlet, useNavigate} from "react-router-dom";
import Icon from "data-base64:~assets/icon.png";
import {useState} from "react";
import IconShortcut from "data-base64:~assets/icon_shortcut.svg";
import IconShortcutSelected from "data-base64:~assets/icon_shortcut_selected.svg";
import IconApiKey from "data-base64:~assets/icon_shortcut.svg";
import IconApiKeySelected from "data-base64:~assets/icon_shortcut_selected.svg";
import {PATH_SETTING_SHORTCUT, PATH_SETTING_APIKEY} from "~options/router";

export default function Layout() {
    const n = useNavigate();
    const [selected, setSelected] = useState('Shortcut');
    const handleClick = ({id, path}: { id: string, path: string }) => {
        go(path);
        setSelected(id);
    };

    const go = function (path: string) {
        n(path);
    };

    const ImageTextComponent = ({ imageSrc, imageSrcSelected, text, onClick, className, isSelected }) => (
        <div className={`w-full flex flex-row ${className}`} onClick={onClick}>
            <img src={isSelected? imageSrcSelected : imageSrc} className={'w-[24px] h-[24px'}/>
            <div className={`text-[15px] ${isSelected ? 'text-[#0A4DFE]' : 'text-[#5E5E5E]'} ml-[12px]`}>{text}</div>
        </div>
    );

    return <div className={'max-w-[1206px] min-w-[1180px] px-[24px] flex m-auto'}>
        <div className={'w-[319px] bg-white cursor-pointer flex-shrink-0 flex-grow-0'}>
            <div className={'w-full flex flex-row mt-[64px] ml-[24px]'}>
                <img src={Icon} className={'w-[32px] h-[32px]'}/>
                <div style={{fontWeight: 500}} className={'text-[20px] text-[#0A4DFE] ml-[10px]'}>BrainyAI
                </div>
            </div>
            <div className={'flex flex-col mt-[86px] ml-[24px]'}>
                <ImageTextComponent onClick={() => handleClick({id: 'Shortcut', path: PATH_SETTING_SHORTCUT})}
                    imageSrc={IconShortcut} imageSrcSelected={IconShortcutSelected}
                    text={'快捷菜单'} className={''}
                    isSelected={selected === 'Shortcut'}/>
                <ImageTextComponent onClick={() => handleClick({id: 'ApiKey', path: PATH_SETTING_APIKEY})}
                    imageSrc={IconApiKey} imageSrcSelected={IconApiKeySelected}
                    text={'API密钥设置'} className={'mt-[24px]'}
                    isSelected={selected === 'ApiKey'}/>
            </div>
        </div>
        <div className={"flex-1"}>
            <Outlet/>
        </div>
    </div>;
}
