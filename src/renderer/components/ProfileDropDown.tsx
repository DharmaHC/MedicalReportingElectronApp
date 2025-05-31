// ProfileDropDown.tsx
import React from "react";
import {
  DropDownButton,
  DropDownButtonItemClickEvent,
} from "@progress/kendo-react-buttons";
import {
  logoutIcon,
  passwordIcon,
  gearIcon,
  xIcon,
} from "@progress/kendo-svg-icons";
import { SvgIcon } from "@progress/kendo-react-common";

interface ProfileDropDownProps {
  onLogout: () => void;
  onChangePassword: () => void;
  onLogoutAndExit: () => void;
}

const items = [
  { id: "changePassword", text: "Cambia Password", icon: passwordIcon },
  { id: "logout", text: "Logout", icon: logoutIcon },
  { id: "logoutAndExit", text: "Logout ed Esci", icon: xIcon },
];

// Render custom degli item con icona
const itemRender = (props: { item: any }) => (
  <div style={{ display: "flex", alignItems: "center" }}>
    {props.item.icon && (
      <SvgIcon icon={props.item.icon} style={{ marginRight: 8 }} />
    )}
    <span>{props.item.text}</span>
  </div>
);

const ProfileDropDown: React.FC<ProfileDropDownProps> = ({
  onLogout,
  onChangePassword,
  onLogoutAndExit,
}) => {
  const handleItemClick = (event: DropDownButtonItemClickEvent) => {
    if (event.item?.id === "changePassword") {
      onChangePassword();
    } else if (event.item?.id === "logout") {
      onLogout();
    } else if (event.item?.id === "logoutAndExit") {
      onLogoutAndExit();
    }
  };

  return (
    <DropDownButton
      text="Profilo"
      svgIcon={gearIcon}
      items={items}
      onItemClick={handleItemClick}
      itemRender={itemRender}
      className="profile-button"
    />
  );
};

export default ProfileDropDown;
