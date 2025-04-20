import {createBrowserRouter, useLocation} from "react-router-dom";
import Index from "~options/pages";
import ShortcutMenu from "~options/pages/ShortcutMenu";
import ApiKeySettings from "~options/pages/ApiKeySettings";
import Layout from "~options/layout";
import OptionsProvider from "~provider/Options";
import {Fragment, useContext, useEffect} from "react";
import {GoogleAnalyticsContext} from "~provider/GoogleAnalyticsProvider";

export const PATH_SETTING_SIDEBAR = "path_shortcut";
export const PATH_SETTING_CONTACT_US = "path_contact_us";
export const PATH_SETTING_SHORTCUT = "";
export const PATH_SETTING_APIKEY = "api_key";

const Wrapper = ({children}) => {
    const location = useLocation();
    const {analytics} = useContext(GoogleAnalyticsContext);

    useEffect(() => {
        void analytics.current.firePageViewEvent("", location.pathname);
    }, [location]);

    return <Fragment>
        {children}
    </Fragment>;
};

export const router = createBrowserRouter([
    {
        path: "options.html",
        element: <Wrapper>
            <OptionsProvider><Layout/></OptionsProvider>
        </Wrapper>,
        children: [
            // {
            //     path: "",
            //     element: <DetermineRedirect/>,
            // },
            {
                path: PATH_SETTING_SIDEBAR,
                element: <Index/>,
            },
            {
                path: PATH_SETTING_SHORTCUT,
                element: <ShortcutMenu/>,
            },
            {
                path: PATH_SETTING_APIKEY,
                element: <ApiKeySettings/>,
            },
        ],
    },
]);
