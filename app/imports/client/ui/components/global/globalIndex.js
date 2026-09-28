// Global components
import DatePicker from '/imports/client/ui/components/global/DatePicker.vue';
import DragHandle from '/imports/client/ui/components/global/DragHandle.vue';
import IconPicker from '/imports/client/ui/components/global/IconPicker.vue';
import TextField from '/imports/client/ui/components/global/TextField.vue';
import TextArea from '/imports/client/ui/components/global/TextArea.vue';
import SmartSelect from '/imports/client/ui/components/global/SmartSelect.vue';
import SmartBtn from '/imports/client/ui/components/global/SmartBtn.vue';
import SmartCombobox from '/imports/client/ui/components/global/SmartCombobox.vue';
import SmartCheckbox from '/imports/client/ui/components/global/SmartCheckbox.vue';
import SmartSwitch from '/imports/client/ui/components/global/SmartSwitch.vue';
import SmartToggle from '/imports/client/ui/components/global/SmartToggle.vue';
import SvgIcon from '/imports/client/ui/components/global/SvgIcon.vue';
import SmartSlider from '/imports/client/ui/components/global/SmartSlider.vue';

export default function registerGlobalComponents(app) {
	app.component('DatePicker', DatePicker);
	app.component('DragHandle', DragHandle);
	app.component('IconPicker', IconPicker);
	app.component('TextField', TextField);
	app.component('TextArea', TextArea);
	app.component('SmartSelect', SmartSelect);
	app.component('SmartBtn', SmartBtn);
	app.component('SmartCombobox', SmartCombobox);
	app.component('SmartCheckbox', SmartCheckbox);
	app.component('SmartSlider', SmartSlider);
	app.component('SmartSwitch', SmartSwitch);
	app.component('SmartToggle', SmartToggle);
	app.component('SvgIcon', SvgIcon);
}
