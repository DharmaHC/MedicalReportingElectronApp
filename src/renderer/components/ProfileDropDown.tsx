// ProfileDropDown.tsx
import React from "react";
import { DropDownButton, DropDownButtonItemClickEvent } from "@progress/kendo-react-buttons";
import { logoutIcon, passwordIcon, gearIcon } from "@progress/kendo-svg-icons";
import { SvgIcon } from "@progress/kendo-react-common";

interface ProfileDropDownProps {
  onLogout: () => void;
  onChangePassword: () => void;
}

const items = [
  { id: "changePassword", text: "Cambia Password", icon: passwordIcon },
  { id: "logout", text: "Logout", icon: logoutIcon },
];

const itemRender = (props: { item: any }) => {
  // Esempio: disegni l’icona con <SvgIcon icon={props.item.icon} />
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {props.item.icon && (
        <SvgIcon
          icon={props.item.icon}
          style={{ marginRight: 8 }}
        />
      )}
      <span>{props.item.text}</span>
    </div>
  );
};

const ProfileDropDown: React.FC<ProfileDropDownProps> = ({
  onLogout,
  onChangePassword
}) => {
  const handleItemClick = (event: DropDownButtonItemClickEvent) => {
    if (event.item.id === "logout") {
      onLogout();
    } else if (event.item.id === "changePassword") {
      onChangePassword();
    }
  };

  return (
    <DropDownButton
      text="Profilo"
      svgIcon={gearIcon}
      items={items}
      onItemClick={handleItemClick}
      itemRender={itemRender}
      className="profile-button"   // se vuoi uno stile personalizzato
    />
  );
};

export default ProfileDropDown;
