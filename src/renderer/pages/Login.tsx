import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Form, Field, FormElement } from "@progress/kendo-react-form";
import { Input, Checkbox } from "@progress/kendo-react-inputs";
import { Button } from "@progress/kendo-react-buttons";
import { SvgIcon } from "@progress/kendo-react-common";
import { eyeIcon, eyeSlashIcon } from "@progress/kendo-svg-icons";
import { Notification, NotificationGroup } from "@progress/kendo-react-notification";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { AutoComplete } from "@progress/kendo-react-dropdowns";

import {
  login,
  setToken,
  setUserId,
  setDoctorCode,
  setAllowMedicalReportDigitalSignature,
  setprintReportWhenFinished,
  setUserCN,
} from "../store/authSlice";
import "./Login.css";
import { useNavigate } from "react-router-dom";
import { url_info, url_login, url_doctors, url_passwordForgot } from "../utility/urlLib";
import { RootState } from "../store";
import { setFilters } from "../store/filtersSlice";

interface PasswordForgotBody {
  username: string;
}


/** Valida che un campo non sia vuoto */
const requiredValidator = (value: any) => {
  return value ? "" : "Questo campo è richiesto";
};

const Login = () => {

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });


  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.auth.token);

  /** Carica il nome utente da localStorage (se esiste). 
   *  Se esiste, significa che l'utente aveva spuntato "remember me" in precedenza.
   */
  const savedUsernames = getSavedUsernames();
const [userName, setUserName] = useState(savedUsernames.length > 0 ? savedUsernames[savedUsernames.length - 1] : "");
const [usernamesList, setUsernamesList] = useState<string[]>(savedUsernames);


  // Funzione per fetchare informazioni su firma digitale se medico
  const fetchDoctorSignatureInfo = async (doctorCode: string) => {
    try {
      const response = await fetch(`${url_doctors}${doctorCode}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        dispatch(setAllowMedicalReportDigitalSignature(data.allowMedicalReportDigitalSignature));
      } else {
        console.error("Failed to fetch doctor signature info");
      }
    } catch (error) {
      console.error("Error fetching doctor signature info:", error);
    }
  };

	const handleForgotPasswordSubmit = async () => {
    if (codiceFiscale) {
      const forgotPasswordBody: PasswordForgotBody = { username: codiceFiscale };
      postForgotPassword(forgotPasswordBody);
    } else {
		setNotification({ type: "error", message: "Inserisci il Codice Fiscale." });
		return;
		}
	};

  const postForgotPassword = async (body: PasswordForgotBody) => {
    try {
      const response = await fetch(url_passwordForgot, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const responseData = await response.json();
		if (response.ok) {
		  // Successo
		  setForgotPasswordVisible(false);
		  setCodiceFiscale("");
		  setNotification({ type: "success", message: responseData.messaggio || "Verifica la tua email." });
		} else {
		  // Errore dal server
		  setNotification({ type: "error", message: responseData.messaggio || "Errore nel reset password." });
		}
	  } catch (error) {
		setNotification({ type: "error", message: "Errore di rete. Riprova più tardi." });
	  }
  };

  // Funzione per fetchare informazioni aggiuntive sull'utente appena loggato
  const fetchUserInfo = async (userName: string) => {
    try {
      const response = await fetch(
        `${url_info}?userName=${encodeURIComponent(userName)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const text = await response.text();
        console.log(text);

        const result = JSON.parse(text);
        const userId = result.userId;
        const doctorCode = result.doctorCode;
    		const printReportWhenFinished = !!result.printReportWhenFinished;
    		const userCN = result.userCN;

        dispatch(setUserId(userId));
        dispatch(setDoctorCode(doctorCode));
    		dispatch(setprintReportWhenFinished(printReportWhenFinished));
        dispatch(setUserCN(userCN));
		if (doctorCode) {
          fetchDoctorSignatureInfo(doctorCode.trim());
        }
      } else {
        console.error("Failed to fetch user info");
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  };

  function getSavedUsernames(): string[] {
    try {
      const saved = localStorage.getItem("savedUsernames");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback: corrotto o non esistente
    }
    return [];
  }

  function addSavedUsername(userName: string) {
    const trimmed = userName.trim();
    if (!trimmed) return;
    const list = getSavedUsernames();
    if (!list.includes(trimmed)) {
      list.push(trimmed);
      localStorage.setItem("savedUsernames", JSON.stringify(list));
    }
  }

  function removeSavedUsername(userName: string) {
    const trimmed = userName.trim();
    const list = getSavedUsernames().filter(u => u !== trimmed);
    localStorage.setItem("savedUsernames", JSON.stringify(list));
  }

  /** Invocata da Kendo al submit del form */
  const handleSubmit = async (dataItem: { [name: string]: any }) => {
    /** dataItem conterrà i valori attuali del form: userName, password, rememberMe */
    const { userName, password, rememberMe } = dataItem as {
      userName: string;
      password: string;
      rememberMe: boolean;
    };

    try {
      const response = await fetch(url_login, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userName,
          password
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Login success:", result);

        // Salva lo state di login (redux)
        dispatch(login({ userName, rememberMe }));

        // ► Svuota i dati legati al medico precedente
        dispatch(
          setFilters({
            workareasData: [],          // lista settori
            doctorsData: [],          // lista settori
            clinicDepartmentsData: [],  // lista U.O.
            sectors: {},                // mappa booleana settori
            units: {}                   // mappa booleana U.O.
          })
        );
                //dispatch(setToken(result.token));
        // Aggiorniamo localStorage in base a "rememberMe"
        if (rememberMe) {
          addSavedUsername(userName);
          setUsernamesList(getSavedUsernames()); // aggiorna la lista in stato React
        } else {
          removeSavedUsername(userName);
          setUsernamesList(getSavedUsernames());
        }

        // Fetch user info
        await fetchUserInfo(userName);

        // Naviga nella home
        navigate("/");
      } else {
        console.error("Login failed");
        navigate(-1);
      }
    } catch (error) {
      navigate(-1);
      console.error("Error:", error);
    }
  };

  /** Mostra/nasconde la password */
  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };


  const getAssetPath = (assetRelPath: string) => {
    // Dev: Vite serve tutto da /assets
    if (!window.location.href.startsWith("file://")) {
      return `/assets/${assetRelPath}`;
    }
    // Prod: file://, index.html in renderer-dist/renderer, assets in ../../assets
    return `../../../assets/${assetRelPath}`;
  };

return (<>
    <div className="login-container">
      <div className="login-image">
        <img src={getAssetPath('Images/login2-img.jpg')} alt="Login" />
      </div>

      <div className="login-form-container">
        <Form
          /** Imposta i valori iniziali nel form */
          initialValues={{
            userName: userName,
            password: "",
            rememberMe: !!userName
      }}
          onSubmit={(dataItem) => handleSubmit({ ...dataItem, userName })}
          render={(formRenderProps) => (
            <FormElement
              className="login-form"
              style={{ width: 320 }}
              autoComplete="off"
            >
              <h2>Login</h2>

              {/* Campo userName */}
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="userName" style={{ fontWeight: "bold" }}>UserName</label>
                <AutoComplete
                  id="userName"
                  style={{ width: "60%" }}
                  data={usernamesList}
                  value={userName}
                   onChange={e => setUserName(e.value as string)}
                  name="userName"
                  required={true}
                />
              </div>

              {/* Campo password + toggle visibilità */}
              <div className="password-field">
                <Field
                  name="password"
                  component={Input}
                  label="Password"
                  type={passwordVisible ? "text" : "password"}
                  validator={[requiredValidator]}
                  autoComplete="new-password"
                />
                <span
                  className="toggle-password-icon"
                  onClick={togglePasswordVisibility}
                >
                  <SvgIcon icon={passwordVisible ? eyeSlashIcon : eyeIcon} />
                </span>
              </div>

              {/* Checkbox “Ricorda Username” gestito da Kendo */}
              <Field
                name="rememberMe"
                type="checkbox"
                component={Checkbox}
                label="Ricorda Username"
              />
			    <a href="#"
				  onClick={(e) => {
				    e.preventDefault();
				    setForgotPasswordVisible(true); // Mostra il dialog
				  }}
				  style={{ marginLeft: "1rem", fontSize: "0.9rem" }}
			    >
				  Password Dimenticata?
			    </a>
			  <div>
              <Button themeColor={"primary"} type="submit">
                Login
              </Button>
              <Button themeColor={"base"} style={ {marginLeft:10} } onClick={() => {
                // Chiude l'applicazione}>
                window.close();
              }}>
                Chiudi App
              </Button>
			  </div>
            </FormElement>
          )}
        />
      </div>
		{/* Notifica globale */}
		<NotificationGroup style={{ right: 10, bottom: 10, zIndex: 9999, position: "fixed" }}>
		  {notification.type && (
			<Notification
			  type={{
				style: notification.type === "success" ? "success" : "error",
				icon: true
			  }}
			  closable
			  onClose={() => setNotification({ type: null, message: "" })}
			>
			  {notification.message}
			</Notification>
		  )}
		</NotificationGroup>

    </div>
	{forgotPasswordVisible && (
	  <Dialog
		title="Password Dimenticata"
		onClose={() => setForgotPasswordVisible(false)}
		style={{ width: "400px" }}
	  >
		<div style={{ textAlign: "center", margin: "1rem" }}>
		  <p>Inserisci il Codice Fiscale per ricevere il reset password:</p>
		  <Input
			value={codiceFiscale}
			onChange={(e) => setCodiceFiscale(e.value)}
			style={{ width: "100%" }}
			placeholder="Codice Fiscale"
		  />
		</div>

		<DialogActionsBar>
		  <Button
			onClick={() => {
			  setForgotPasswordVisible(false);
			  setCodiceFiscale("");
			}}
		  >
			Annulla
		  </Button>
		  <Button
			themeColor="primary"
			onClick={handleForgotPasswordSubmit}
		  >
			Invia
		  </Button>
		</DialogActionsBar>
	  </Dialog>
	)}

  </>
  );
  
};

export default Login;
